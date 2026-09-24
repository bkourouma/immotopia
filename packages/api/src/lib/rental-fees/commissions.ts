import { prisma } from '../../utils/database';
import { badRequest } from '../errors';
import { roundMoney } from '../finance/money';
import { materializeManagementFees } from './materialize';

/**
 * État des commissions des agents pour un mois : les honoraires HT générés sur
 * les baux de chaque gestionnaire, et la part qui lui revient.
 *
 * Lit des honoraires figés à l'encaissement : la part affichée est celle du
 * jour de l'encaissement, même si la part du collaborateur a changé depuis.
 */

export const UNASSIGNED_AGENT_LABEL = 'Sans gestionnaire';

function monthBounds(period: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  const month = match ? Number(match[2]) : 0;
  if (!match || month < 1 || month > 12) throw badRequest('Periode invalide, format attendu YYYY-MM');
  const year = Number(match[1]);
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
  };
}

export async function getAgentCommissions(tenantId: string, period: string) {
  const { from, to } = monthBounds(period);
  await materializeManagementFees(tenantId, { from, to });

  const fees = await prisma.managementFee.findMany({
    where: { tenantId, collectedAt: { gte: from, lte: to } },
    orderBy: { collectedAt: 'asc' }
  });

  const leaseIds = Array.from(new Set(fees.map(f => f.leaseId)));
  const agentIds = Array.from(new Set(fees.map(f => f.agentUserId).filter((id): id is string => Boolean(id))));
  const [leases, users, rates] = await Promise.all([
    leaseIds.length
      ? prisma.rentalLease.findMany({
          where: { tenant_id: tenantId, id: { in: leaseIds } },
          select: { id: true, lease_number: true, property: { select: { title: true } } }
        })
      : Promise.resolve([]),
    agentIds.length
      ? prisma.user.findMany({ where: { id: { in: agentIds } }, select: { id: true, fullName: true, email: true } })
      : Promise.resolve([]),
    prisma.agentCommissionRate.findMany({ where: { tenantId } })
  ]);
  const leaseById = new Map(leases.map(l => [l.id, l]));
  const userById = new Map(users.map(u => [u.id, u]));
  const shareByUser = new Map(rates.map(r => [r.userId, Number(r.sharePercent)]));

  type Group = {
    agentUserId: string | null;
    agentName: string;
    sharePercent: number | null;
    feeCount: number;
    feesAmount: number;
    shareAmount: number;
    lines: Array<{
      id: string;
      collectedAt: string;
      leaseId: string;
      leaseNumber: string;
      propertyTitle: string;
      collectedAmount: number;
      feeAmount: number;
      shareAmount: number;
    }>;
  };
  const groups = new Map<string, Group>();
  let feesAmount = 0;
  let vatAmount = 0;
  let shareAmount = 0;
  let unassignedFeesAmount = 0;

  for (const fee of fees) {
    const key = fee.agentUserId ?? '';
    let group = groups.get(key);
    if (!group) {
      const user = fee.agentUserId ? userById.get(fee.agentUserId) : undefined;
      group = {
        agentUserId: fee.agentUserId,
        agentName: user ? user.fullName || user.email : UNASSIGNED_AGENT_LABEL,
        sharePercent: fee.agentUserId ? (shareByUser.get(fee.agentUserId) ?? null) : null,
        feeCount: 0,
        feesAmount: 0,
        shareAmount: 0,
        lines: []
      };
      groups.set(key, group);
    }
    const lease = leaseById.get(fee.leaseId);
    const feeValue = Number(fee.feeAmount);
    const shareValue = Number(fee.agentShareAmount);
    group.feeCount += 1;
    group.feesAmount += feeValue;
    group.shareAmount += shareValue;
    group.lines.push({
      id: fee.id,
      collectedAt: fee.collectedAt.toISOString(),
      leaseId: fee.leaseId,
      leaseNumber: lease?.lease_number ?? '',
      propertyTitle: lease?.property?.title ?? '',
      collectedAmount: Number(fee.collectedAmount),
      feeAmount: feeValue,
      shareAmount: shareValue
    });

    feesAmount += feeValue;
    vatAmount += Number(fee.vatAmount);
    shareAmount += shareValue;
    if (!fee.agentUserId) unassignedFeesAmount += feeValue;
  }

  // Les agents d'abord, par commission décroissante ; « Sans gestionnaire » en dernier.
  const agents = Array.from(groups.values())
    .map(g => ({ ...g, feesAmount: roundMoney(g.feesAmount), shareAmount: roundMoney(g.shareAmount) }))
    .sort((a, b) => {
      if (a.agentUserId === null) return 1;
      if (b.agentUserId === null) return -1;
      return b.shareAmount - a.shareAmount || a.agentName.localeCompare(b.agentName, 'fr');
    });

  return {
    period,
    totals: {
      feesAmount: roundMoney(feesAmount),
      vatAmount: roundMoney(vatAmount),
      shareAmount: roundMoney(shareAmount),
      unassignedFeesAmount: roundMoney(unassignedFeesAmount)
    },
    agents
  };
}
