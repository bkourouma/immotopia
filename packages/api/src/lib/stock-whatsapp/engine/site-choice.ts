import { prisma, type PrismaTransactionClient } from '../../../utils/database';
import {
  abandonPendingCapture,
  closeSessionRow,
  findOpenSession,
  OPEN_STATES,
  SESSION_SELECT,
  transitionSession,
  withRegistrationLock,
  type ChefTarget,
  type SessionRow
} from './states';

/**
 * Chantiers d'une inscription et leur éligibilité (lot 041, spec W3-R5,
 * W4-R3, W5-R8).
 *
 * Un chantier est éligible s'il est ouvert (`status ≠ CLOSED`), basculé au
 * stock (`stockEnabledAt` non nul) et si son lieu de chantier (`kind = SITE`)
 * est actif. L'éligibilité est relue à chaque lecture : un chantier clos reste
 * affecté mais n'est plus proposé.
 */

type Db = PrismaTransactionClient | typeof prisma;

export type SiteIneligibleReason = 'CLOSED' | 'NOT_STOCK_ENABLED' | 'LOCATION_INACTIVE';

/** Contrat `SiteRef`. */
export type SiteRef = {
  siteId: string;
  name: string;
  locationId: string | null;
  eligible: boolean;
  ineligibleReason: SiteIneligibleReason | null;
};

/** Champs lus d'un chantier pour juger son éligibilité. */
export const SITE_ELIGIBILITY_SELECT = {
  id: true,
  name: true,
  status: true,
  stockEnabledAt: true,
  stockLocation: { select: { id: true, kind: true, isActive: true } }
} as const;

export type SiteEligibilityRow = {
  id: string;
  name: string;
  status: string;
  stockEnabledAt: Date | null;
  stockLocation: { id: string; kind: string; isActive: boolean } | null;
};

export function toSiteRef(site: SiteEligibilityRow): SiteRef {
  const location = site.stockLocation && site.stockLocation.kind === 'SITE' ? site.stockLocation : null;
  let reason: SiteIneligibleReason | null = null;
  if (site.status === 'CLOSED') reason = 'CLOSED';
  else if (!site.stockEnabledAt) reason = 'NOT_STOCK_ENABLED';
  else if (!location || !location.isActive) reason = 'LOCATION_INACTIVE';
  return {
    siteId: site.id,
    name: site.name,
    locationId: location?.id ?? null,
    eligible: reason === null,
    ineligibleReason: reason
  };
}

/** Tous les chantiers affectés à une inscription, avec leur éligibilité, par nom. */
export async function loadRegistrationSiteRefs(db: Db, tenantId: string, registrationId: string): Promise<SiteRef[]> {
  const links = await db.stockWhatsappRegistrationSite.findMany({
    where: { tenantId, registrationId },
    select: { site: { select: SITE_ELIGIBILITY_SELECT } }
  });
  return links
    .map(link => toSiteRef(link.site as SiteEligibilityRow))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Chantiers éligibles d'une inscription (ceux que le bot propose). */
export async function loadEligibleSites(
  db: Db,
  tenantId: string,
  registrationId: string
): Promise<Array<SiteRef & { locationId: string }>> {
  const refs = await loadRegistrationSiteRefs(db, tenantId, registrationId);
  return refs.filter((ref): ref is SiteRef & { locationId: string } => ref.eligible && ref.locationId !== null);
}

// ---------------------------------------------------------------------------
// Ouverture de session et choix du chantier (W4-R1, W4-R3, W5-R8)
// ---------------------------------------------------------------------------

/** Ce que le choix du chantier a donné. */
export type SiteChoice =
  | { kind: 'NONE' }
  | { kind: 'SINGLE'; site: SiteRef & { locationId: string } }
  | { kind: 'MANY'; sites: Array<SiteRef & { locationId: string }> };

/**
 * Applique le choix à une session ouverte dont la capture en attente a déjà
 * été abandonnée : aucun chantier → session fermée (`NO_SITE`, M09) ; un seul
 * → associé d'office, `READY` ; plusieurs → `AWAITING_SITE` (M08).
 */
export async function applySiteChoiceTx(
  tx: PrismaTransactionClient,
  session: Pick<SessionRow, 'id' | 'tenantId'>,
  eligible: Array<SiteRef & { locationId: string }>,
  now: Date
): Promise<SiteChoice> {
  if (eligible.length === 0) {
    await closeSessionRow(tx, session, 'NO_SITE', now, 'NONE');
    return { kind: 'NONE' };
  }
  const single = eligible.length === 1 ? eligible[0] : null;
  await transitionSession(tx, session, OPEN_STATES, {
    state: single ? 'READY' : 'AWAITING_SITE',
    siteId: single?.siteId ?? null,
    locationId: single?.locationId ?? null,
    countId: null,
    pendingCaptureId: null,
    reminderSentAt: null
  });
  return single ? { kind: 'SINGLE', site: single } : { kind: 'MANY', sites: eligible };
}

export type OpenedSession = {
  sessionId: string;
  justOpened: boolean;
  /** Choix fait à l'ouverture, après la perte du chantier (W5-R8) ; nul si rien n'a changé. */
  choice: SiteChoice | null;
  /** Nom du chantier devenu inéligible (M32). */
  lostSiteName: string | null;
};

async function createSession(tx: PrismaTransactionClient, target: ChefTarget, now: Date): Promise<OpenedSession> {
  const eligible = await loadEligibleSites(tx, target.tenantId, target.registrationId);
  const single = eligible.length === 1 ? eligible[0] : null;
  const created = await tx.stockWhatsappSession.create({
    data: {
      tenantId: target.tenantId,
      registrationId: target.registrationId,
      state: eligible.length === 0 ? 'CLOSED' : single ? 'READY' : 'AWAITING_SITE',
      siteId: single?.siteId ?? null,
      locationId: single?.locationId ?? null,
      lastInboundAt: now,
      openedAt: now,
      ...(eligible.length === 0 ? { closedAt: now, closeReason: 'NO_SITE' as const, countOutcome: 'NONE' } : {})
    },
    select: { id: true }
  });
  const choice: SiteChoice =
    eligible.length === 0
      ? { kind: 'NONE' }
      : single
        ? { kind: 'SINGLE', site: single }
        : { kind: 'MANY', sites: eligible };
  return { sessionId: created.id, justOpened: true, choice, lostSiteName: null };
}

/**
 * Session ouverte de l'inscription, ou nouvelle session (W4-R1). Met à jour
 * `lastInboundAt` et remet la relance à zéro (W4-R5). Vérifie que le chantier
 * de la session est toujours éligible (W5-R8) : sinon M32 et nouveau choix.
 */
export async function openOrResumeSession(target: ChefTarget, now: Date): Promise<OpenedSession> {
  return withRegistrationLock(target.registrationId, async tx => {
    const session = await findOpenSession(tx, target.tenantId, target.registrationId);
    if (!session) return createSession(tx, target, now);

    await tx.stockWhatsappSession.updateMany({
      where: { id: session.id, tenantId: target.tenantId, closedAt: null },
      data: { lastInboundAt: now, reminderSentAt: null }
    });
    if (!session.siteId) return { sessionId: session.id, justOpened: false, choice: null, lostSiteName: null };

    const eligible = await loadEligibleSites(tx, target.tenantId, target.registrationId);
    if (eligible.some(site => site.siteId === session.siteId)) {
      return { sessionId: session.id, justOpened: false, choice: null, lostSiteName: null };
    }
    const lost = await tx.constructionSite.findFirst({
      where: { id: session.siteId, tenantId: target.tenantId },
      select: { name: true }
    });
    await abandonPendingCapture(tx, session);
    const choice = await applySiteChoiceTx(tx, session, eligible, now);
    return { sessionId: session.id, justOpened: false, choice, lostSiteName: lost?.name ?? '' };
  });
}

export type SiteReplyResult =
  | { kind: 'INVALID'; sites: Array<SiteRef & { locationId: string }> }
  | { kind: 'READY'; site: SiteRef }
  | { kind: 'ANALYZE'; site: SiteRef; captureId: string }
  | { kind: 'STALE' };

/** Réponse de bouton ou de liste au choix du chantier (`AWAITING_SITE`). */
export async function chooseSite(target: ChefTarget, sessionId: string, siteId: string): Promise<SiteReplyResult> {
  return withRegistrationLock(target.registrationId, async tx => {
    const session = await tx.stockWhatsappSession.findFirst({
      where: { id: sessionId, tenantId: target.tenantId, closedAt: null, state: 'AWAITING_SITE' },
      select: SESSION_SELECT
    });
    if (!session) return { kind: 'STALE' };
    const eligible = await loadEligibleSites(tx, target.tenantId, target.registrationId);
    const site = eligible.find(candidate => candidate.siteId === siteId);
    if (!site) return { kind: 'INVALID', sites: eligible };
    const analyze = Boolean(session.pendingCaptureId);
    const moved = await transitionSession(tx, session, ['AWAITING_SITE'], {
      state: analyze ? 'ANALYZING' : 'READY',
      siteId: site.siteId,
      locationId: site.locationId,
      countId: null,
      reminderSentAt: null
    });
    if (!moved) return { kind: 'STALE' };
    return analyze && session.pendingCaptureId
      ? { kind: 'ANALYZE', site, captureId: session.pendingCaptureId }
      : { kind: 'READY', site };
  });
}
