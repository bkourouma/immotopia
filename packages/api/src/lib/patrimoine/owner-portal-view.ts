import { prisma } from '../../utils/database';
import { ownerPortalPropertyWhere } from '../owner-portal-scope';
import { NotFoundError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { getOwnerPortalSettings, type OwnerPortalSettingsDto } from '../settings/owner-portal-settings';
import { ownerSharesByProperty } from '../ownership/service';
import { buildPropertyYieldInput } from './queries';
import { grossYield, netYield, netNetYield, latentCapitalGain } from './yield';
import { PORTAL_PROPERTY_DOCUMENT_SELECT } from '../files/portal-files';
import { VALUATION_ORDER_BY } from './valuation-order';

/**
 * Vue patrimoine du portail propriétaire (lot P5). Contrat figé dans
 * `p5-contrat-api.md` : back et front l'implémentent tel quel.
 *
 * Aucun second moteur de calcul — `buildPropertyYieldInput` et les fonctions
 * de `lib/patrimoine/yield.ts` sont la seule source des rendements. Toute
 * requête est filtrée par `tenantId` ET `propertyId in propertyIds` (les
 * biens déjà résolus par `requireOwnerPortalAccess`, limités à l'agence du
 * portail) : un bien d'un autre propriétaire ou d'une autre agence n'apparaît
 * jamais, la même 404 que « bien inexistant ».
 */

const NOT_FOUND_MESSAGE = () => t('Vue patrimoine indisponible.');

export interface PatrimoineSections {
  valuation: boolean;
  yield: boolean;
  loans: boolean;
  works: boolean;
  documents: boolean;
}

function sectionsFor(settings: OwnerPortalSettingsDto): PatrimoineSections {
  if (!settings.patrimonyEnabled) {
    return { valuation: false, yield: false, loans: false, works: false, documents: false };
  }
  return {
    valuation: settings.patrimonyShowValuation,
    yield: settings.patrimonyShowYield,
    loans: settings.patrimonyShowLoans,
    works: settings.patrimonyShowWorks,
    documents: settings.patrimonyShowDocuments
  };
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

/** `GET /patrimoine/settings` — toujours 200, sert au menu. */
export async function getPatrimoineSettingsForOwnerPortal(tenantId: string) {
  const settings = await getOwnerPortalSettings(tenantId);
  return { enabled: settings.patrimonyEnabled, sections: sectionsFor(settings) };
}

function assertPropertyInScope(propertyId: string, propertyIds: string[]): void {
  if (!propertyIds.includes(propertyId)) {
    throw new NotFoundError(NOT_FOUND_MESSAGE());
  }
}

/**
 * Bien du périmètre du propriétaire, filtré par agence ET par la liste
 * résolue. `Property` n'a pas de colonne `city` : `locationZone` (quartier /
 * commune) en tient lieu, sorti sous la clé `city` attendue par le contrat.
 */
async function loadScopedProperties(tenantId: string, propertyIds: string[]) {
  if (!propertyIds.length) return [];
  return prisma.property.findMany({
    where: ownerPortalPropertyWhere(propertyIds, tenantId),
    select: { id: true, title: true, address: true, locationZone: true },
    orderBy: { title: 'asc' }
  });
}

/** Dernière valorisation connue de chaque bien du périmètre (batché, pas de N+1). */
async function latestValuationsByProperty(tenantId: string, propertyIds: string[]) {
  if (!propertyIds.length)
    return new Map<string, { valuatedAt: Date; estimatedValue: unknown; acquisitionCost: unknown; currency: string }>();
  const rows = await prisma.assetValuation.findMany({
    where: { tenantId, propertyId: { in: propertyIds } },
    select: { propertyId: true, valuatedAt: true, estimatedValue: true, acquisitionCost: true, currency: true },
    orderBy: VALUATION_ORDER_BY
  });
  const byProperty = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    // `in: propertyIds` exclut déjà les lignes d'actif (propertyId nul) ; le garde satisfait le typage.
    if (row.propertyId === null) continue;
    if (!byProperty.has(row.propertyId)) byProperty.set(row.propertyId, row);
  }
  return byProperty;
}

/** Emprunts ACTIFS de chaque bien du périmètre, agrégés (batché). */
async function activeLoanSummariesByProperty(tenantId: string, propertyIds: string[]) {
  const result = new Map<string, { count: number; remainingCapital: number }>();
  if (!propertyIds.length) return result;
  const loans = await prisma.propertyLoan.findMany({
    where: { tenantId, propertyId: { in: propertyIds }, status: 'ACTIVE' },
    select: { propertyId: true, remainingCapital: true }
  });
  for (const loan of loans) {
    if (loan.propertyId === null) continue; // exclu par `in: propertyIds`, garde de typage
    const current = result.get(loan.propertyId) ?? { count: 0, remainingCapital: 0 };
    current.count += 1;
    current.remainingCapital += Number(loan.remainingCapital);
    result.set(loan.propertyId, current);
  }
  return result;
}

/** Facteur multiplicatif de la quote-part (null = bien entier, donc 1). */
function shareFactor(sharePercent: number | null): number {
  return sharePercent === null ? 1 : sharePercent / 100;
}

/** `GET /patrimoine` — 404 si la vue est masquée pour l'agence. */
export async function getOwnerPortalPatrimoine(tenantId: string, tenantClientId: string, propertyIds: string[]) {
  const settings = await getOwnerPortalSettings(tenantId);
  if (!settings.patrimonyEnabled) {
    throw new NotFoundError(NOT_FOUND_MESSAGE());
  }
  const sections = sectionsFor(settings);

  const [properties, shares, valuationsByProperty, loanSummariesByProperty] = await Promise.all([
    loadScopedProperties(tenantId, propertyIds),
    ownerSharesByProperty(tenantId, tenantClientId, propertyIds),
    sections.valuation ? latestValuationsByProperty(tenantId, propertyIds) : Promise.resolve(new Map()),
    sections.loans ? activeLoanSummariesByProperty(tenantId, propertyIds) : Promise.resolve(new Map())
  ]);

  let totalEstimatedValue = 0;
  let totalLatentCapitalGain: number | null = null;
  let hasKnownCapitalGain = false;
  let totalRemainingLoanCapital = 0;

  const propertyEntries = await Promise.all(
    properties.map(async property => {
      const sharePercent = shares.has(property.id) ? shares.get(property.id)! : null;
      const factor = shareFactor(sharePercent);

      const entry: Record<string, unknown> = {
        id: property.id,
        title: property.title,
        address: property.address,
        city: property.locationZone,
        ownerSharePercent: sharePercent
      };

      // Une seule construction de l'entrée de rendement par bien, même quand
      // valorisation et rendement sont toutes deux affichées (aucun second
      // moteur, et pas de requête dupliquée).
      const yieldInput =
        sections.valuation || sections.yield ? await buildPropertyYieldInput(tenantId, property.id) : null;

      if (sections.valuation) {
        const valuation = valuationsByProperty.get(property.id) as
          { valuatedAt: Date; estimatedValue: unknown; acquisitionCost: unknown; currency: string } | undefined;
        entry.valuation = valuation
          ? {
              estimatedValue: Number(valuation.estimatedValue),
              valuatedAt: iso(valuation.valuatedAt),
              acquisitionCost: valuation.acquisitionCost === null ? null : Number(valuation.acquisitionCost),
              currency: valuation.currency
            }
          : null;
        if (valuation) {
          totalEstimatedValue += Number(valuation.estimatedValue) * factor;
        }

        const latentGain = latentCapitalGain(yieldInput!);
        entry.latentCapitalGain = latentGain;
        if (latentGain !== null) {
          hasKnownCapitalGain = true;
          totalLatentCapitalGain = (totalLatentCapitalGain ?? 0) + latentGain * factor;
        }
      }

      if (sections.yield) {
        const yieldEntry: Record<string, unknown> = {
          grossYield: grossYield(yieldInput!),
          netYield: netYield(yieldInput!),
          annualRent: yieldInput!.annualRent,
          annualExpenses: yieldInput!.annualExpenses
        };
        if (sections.loans) {
          yieldEntry.netNetYield = netNetYield(yieldInput!);
        }
        entry.yield = yieldEntry;
      }

      if (sections.loans) {
        const summary = loanSummariesByProperty.get(property.id) ?? { count: 0, remainingCapital: 0 };
        entry.loanSummary = summary;
        totalRemainingLoanCapital += summary.remainingCapital * factor;
      }

      return entry;
    })
  );

  const summary: Record<string, unknown> = {
    propertyCount: properties.length,
    currency: 'XOF'
  };
  if (sections.valuation) {
    summary.totalEstimatedValue = totalEstimatedValue;
    summary.totalLatentCapitalGain = hasKnownCapitalGain ? totalLatentCapitalGain : null;
  }
  if (sections.loans) {
    summary.totalRemainingLoanCapital = totalRemainingLoanCapital;
  }

  return { sections, summary, properties: propertyEntries };
}

/** `GET /patrimoine/properties/:propertyId` — 404 si masqué ou hors périmètre. */
export async function getOwnerPortalPatrimoineProperty(
  tenantId: string,
  tenantClientId: string,
  propertyIds: string[],
  propertyId: string
) {
  const settings = await getOwnerPortalSettings(tenantId);
  if (!settings.patrimonyEnabled) {
    throw new NotFoundError(NOT_FOUND_MESSAGE());
  }
  assertPropertyInScope(propertyId, propertyIds);
  const sections = sectionsFor(settings);

  const property = await prisma.property.findFirst({
    where: ownerPortalPropertyWhere([propertyId], tenantId),
    select: { id: true, title: true, address: true, locationZone: true }
  });
  if (!property) {
    throw new NotFoundError(NOT_FOUND_MESSAGE());
  }

  const shares = await ownerSharesByProperty(tenantId, tenantClientId, [propertyId]);
  const sharePercent = shares.has(propertyId) ? shares.get(propertyId)! : null;

  const data: Record<string, unknown> = {
    sections,
    property: {
      id: property.id,
      title: property.title,
      address: property.address,
      city: property.locationZone,
      ownerSharePercent: sharePercent
    }
  };

  // Une seule construction de l'entrée de rendement, même quand valorisation
  // et rendement sont toutes deux affichées.
  const yieldInput = sections.valuation || sections.yield ? await buildPropertyYieldInput(tenantId, propertyId) : null;

  if (sections.valuation) {
    const valuations = await prisma.assetValuation.findMany({
      where: { tenantId, propertyId },
      select: { id: true, valuatedAt: true, estimatedValue: true, method: true, currency: true, acquisitionCost: true },
      orderBy: VALUATION_ORDER_BY
    });
    const latest = valuations[0];
    data.valuation = latest
      ? {
          estimatedValue: Number(latest.estimatedValue),
          valuatedAt: iso(latest.valuatedAt),
          acquisitionCost: latest.acquisitionCost === null ? null : Number(latest.acquisitionCost),
          currency: latest.currency
        }
      : null;
    data.valuations = valuations.map(v => ({
      id: v.id,
      valuatedAt: iso(v.valuatedAt),
      estimatedValue: Number(v.estimatedValue),
      method: v.method,
      currency: v.currency
    }));

    data.latentCapitalGain = latentCapitalGain(yieldInput!);
  }

  if (sections.yield) {
    const yieldEntry: Record<string, unknown> = {
      grossYield: grossYield(yieldInput!),
      netYield: netYield(yieldInput!),
      annualRent: yieldInput!.annualRent,
      annualExpenses: yieldInput!.annualExpenses
    };
    if (sections.loans) {
      yieldEntry.netNetYield = netNetYield(yieldInput!);
    }
    data.yield = yieldEntry;
  }

  if (sections.loans) {
    const loans = await prisma.propertyLoan.findMany({
      where: { tenantId, propertyId },
      select: {
        id: true,
        lender: true,
        capitalAmount: true,
        remainingCapital: true,
        interestRate: true,
        monthlyPayment: true,
        currency: true,
        startDate: true,
        endDate: true,
        status: true
      },
      orderBy: { startDate: 'desc' }
    });
    data.loans = loans.map(loan => ({
      id: loan.id,
      lender: loan.lender,
      capitalAmount: Number(loan.capitalAmount),
      remainingCapital: Number(loan.remainingCapital),
      interestRate: Number(loan.interestRate),
      monthlyPayment: Number(loan.monthlyPayment),
      currency: loan.currency,
      startDate: iso(loan.startDate),
      endDate: iso(loan.endDate),
      status: loan.status
    }));
  }

  if (sections.works) {
    const works = await prisma.workProgram.findMany({
      where: { tenantId, propertyId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        plannedDate: true,
        completedDate: true,
        estimatedCost: true,
        actualCost: true,
        currency: true
      },
      orderBy: { plannedDate: 'desc' }
    });
    data.works = works.map(work => ({
      id: work.id,
      title: work.title,
      description: work.description,
      status: work.status,
      plannedDate: iso(work.plannedDate),
      completedDate: iso(work.completedDate),
      estimatedCost: Number(work.estimatedCost),
      actualCost: work.actualCost === null ? null : Number(work.actualCost),
      currency: work.currency
    }));
  }

  if (sections.documents) {
    const documents = await prisma.propertyDocument.findMany({
      where: { propertyId, OR: [{ tenantId }, { tenantId: null }] },
      select: PORTAL_PROPERTY_DOCUMENT_SELECT,
      orderBy: { createdAt: 'desc' }
    });
    data.documents = documents.map(document => ({
      id: document.id,
      documentType: document.documentType,
      fileName: document.fileName,
      fileSize: document.fileSize,
      mimeType: document.mimeType,
      expirationDate: iso(document.expirationDate),
      createdAt: iso(document.createdAt),
      downloadPath: `/portal/owner/patrimoine/properties/${propertyId}/documents/${document.id}/file`
    }));
  }

  return data;
}

/**
 * Garde de la route de téléchargement : lève si la vue est masquée, la
 * rubrique documents masquée, ou le bien hors périmètre. Le document
 * lui-même (existence, appartenance) reste vérifié par
 * `getPropertyDocumentFileForTenant` (`lib/properties/document-files.ts`).
 */
export async function assertOwnerPortalDocumentAccessible(
  tenantId: string,
  propertyIds: string[],
  propertyId: string
): Promise<void> {
  const settings = await getOwnerPortalSettings(tenantId);
  if (!settings.patrimonyEnabled || !settings.patrimonyShowDocuments) {
    throw new NotFoundError(NOT_FOUND_MESSAGE());
  }
  assertPropertyInScope(propertyId, propertyIds);
}
