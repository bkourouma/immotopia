import type { ChargeCall, ChargeCallStatus, OverdueDashboard, SyndicateLot } from '../../../types/syndic-types';
import { formatLotLabel } from '../../../utils/syndic-lot-label';
import { t } from '../../../i18n/t';

/**
 * Étiquettes de statut d'un appel de charges — mêmes clés que
 * `ChargeCallTable` (composants/syndics), pour ne pas dupliquer la
 * traduction sous une forme légèrement différente.
 */
export const chargeStatusConfig: Record<ChargeCallStatus, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: t('En attente') },
  PARTIAL: { color: 'blue', label: t('Partiel') },
  PAID: { color: 'green', label: t('Payé') },
  OVERDUE: { color: 'red', label: t('En retard') }
};

type LotWithOwner = SyndicateLot & {
  owner?: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null } | null;
};

export function ownerLabel(
  owner?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null
): string {
  if (!owner) return t('Sans copropriétaire');
  const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim();
  return name || owner.email || t('Copropriétaire');
}

export function shortReference(id: string): string {
  return `APPEL-${id.slice(0, 8).toUpperCase()}`;
}

export interface ChargeRow {
  id: string;
  reference: string;
  period: string;
  lotLabel: string;
  ownerLabel: string;
  amount: number;
  paid: number;
  outstanding: number;
  dueDate: string;
  status: ChargeCallStatus;
}

export interface PaymentRow {
  id: string;
  paidAt: string;
  lotLabel: string;
  ownerLabel: string;
  chargeReference: string;
  amount: number;
  method: string;
}

export interface OverdueRow {
  chargeCallId: string;
  lotLabel: string;
  ownerLabel: string;
  outstanding: number;
  daysLate: number;
  remindersCount: number;
}

export function buildChargeRows(charges: ChargeCall[]): ChargeRow[] {
  return charges.map(charge => {
    const lot = charge.lot as LotWithOwner | undefined;
    // Lot S2 : `paidAmount`/`outstandingAmount` sont calculés côté API à
    // partir des affectations ; repli sur `payments[]` si absents.
    const amount = Number(charge.amount);
    const paid =
      charge.paidAmount !== undefined
        ? Number(charge.paidAmount)
        : (charge.payments || []).reduce((sum, payment) => sum + Number(payment.amount), 0);
    return {
      id: charge.id,
      reference: shortReference(charge.id),
      period: charge.period,
      lotLabel: formatLotLabel(lot, charge.lotId),
      ownerLabel: ownerLabel(lot?.owner),
      amount,
      paid,
      outstanding:
        charge.outstandingAmount !== undefined ? Number(charge.outstandingAmount) : Math.max(0, amount - paid),
      dueDate: charge.dueDate,
      status: charge.status
    };
  });
}

export function buildPaymentRows(charges: ChargeCall[]): PaymentRow[] {
  const rows: PaymentRow[] = [];
  for (const charge of charges) {
    const lot = charge.lot as LotWithOwner | undefined;
    for (const payment of charge.payments || []) {
      rows.push({
        id: payment.id,
        paidAt: payment.paidAt,
        lotLabel: formatLotLabel(lot, charge.lotId),
        ownerLabel: ownerLabel(lot?.owner),
        chargeReference: `${charge.period} · ${shortReference(charge.id)}`,
        amount: Number(payment.amount),
        method: payment.method || '—'
      });
    }
  }
  return rows;
}

export function buildOverdueRows(dashboard: OverdueDashboard): OverdueRow[] {
  return dashboard.items.map(item => ({
    chargeCallId: item.chargeCallId,
    lotLabel: formatLotLabel({ lotNumber: item.lotNumber, property: item.property }, item.lotNumber),
    ownerLabel: ownerLabel(item.owner),
    outstanding: item.outstanding,
    daysLate: item.daysLate,
    remindersCount: item.remindersCount ?? 0
  }));
}

/** Message d'erreur d'un chargement de l'écran Finances (réponse API sinon texte générique). */
export function financeLoadError(error: unknown): string | null {
  if (!error) return null;
  const apiMessage = (error as { response?: { data?: { error?: string } } }).response?.data?.error;
  return apiMessage || t('Impossible de charger la synthèse financière');
}
