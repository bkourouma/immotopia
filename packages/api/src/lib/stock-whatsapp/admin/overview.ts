import { prisma } from '../../../utils/database';
import { env, whatsappInventorySimulatorAvailable } from '../../../config/env';
import { getWhatsappQuotaState } from '../quota';

/**
 * Passerelle, quota et mesures de l'inventaire par WhatsApp (lot 041, W1,
 * W11, W14-R7) — `GET …/whatsapp/overview`, `FINANCE_SETTINGS_MANAGE`.
 *
 * Les mesures portent sur l'AGENCE ENTIÈRE et un mois civil UTC : aucune
 * mesure par personne (D4 du lot 040), aucun identifiant de personne dans la
 * réponse. Agrégats en SQL brut avec `tenant_id = $1` explicite (spec §8.2).
 *
 * Le quota est celui du mois COURANT (carte « Photos analysées ce mois-ci ») ;
 * le paramètre `month` ne choisit que le mois des mesures.
 */

export type WhatsappOverview = {
  transport: 'disabled' | 'log' | 'meta';
  gatewayReady: boolean;
  botNumber: string | null;
  simulatorAvailable: boolean;
  vision: { provider: 'disabled' | 'fake' | 'gemini' | 'openrouter'; model: string };
  quota: {
    month: string;
    used: number;
    limit: number;
    source: 'OPTION' | 'WARN_FALLBACK' | 'OFF_FALLBACK' | 'NONE';
    blocks: number;
  };
  measures: {
    photosAnalyzed: number;
    medianSecondsToConfirm: number | null;
    acceptedFirstTimeRate: number | null;
    proofCoverageRate: number | null;
    unreadableRate: number | null;
    unrecognizedRate: number | null;
    failedRate: number | null;
  };
};

/** `AAAA-MM` du mois civil UTC de `date`. */
export function utcMonthOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Bornes `[début, fin)` du mois `AAAA-MM`, en UTC. */
export function utcMonthBounds(month: string): { start: Date; end: Date } {
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 1))
  };
}

/** Variables de la passerelle présentes (le contenu n'est jamais lu ni rendu). */
function gatewayReadyOf(): boolean {
  switch (env.WHATSAPP_INVENTORY_TRANSPORT) {
    case 'meta':
      return Boolean(
        env.META_WA_APP_SECRET && env.META_WA_VERIFY_TOKEN && env.META_WA_ACCESS_TOKEN && env.META_WA_PHONE_NUMBER_ID
      );
    case 'log':
      return true;
    default:
      return false;
  }
}

type MeasureRow = {
  total: number | bigint | null;
  accepted: number | bigint | null;
  corrected: number | bigint | null;
  unreadable: number | bigint | null;
  unrecognized: number | bigint | null;
  failed: number | bigint | null;
  median_seconds: number | string | null;
  whatsapp_lines: number | bigint | null;
  lines_with_photo: number | bigint | null;
};

function int(value: number | bigint | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

/** Part arrondie à quatre décimales, `null` sans dénominateur. */
function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

/** Mesures du mois, agence entière (W14-R7). */
export async function computeWhatsappMeasures(tenantId: string, month: string): Promise<WhatsappOverview['measures']> {
  const { start, end } = utcMonthBounds(month);

  const usage = await prisma.stockWhatsappUsage.findUnique({
    where: { tenantId_month: { tenantId, month } },
    select: { used: true }
  });

  const rows = await prisma.$queryRaw<MeasureRow[]>`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE outcome = 'ACCEPTED')::int AS accepted,
      COUNT(*) FILTER (WHERE outcome = 'CORRECTED')::int AS corrected,
      COUNT(*) FILTER (WHERE outcome = 'UNREADABLE')::int AS unreadable,
      COUNT(*) FILTER (WHERE outcome = 'UNRECOGNIZED')::int AS unrecognized,
      COUNT(*) FILTER (WHERE outcome = 'FAILED')::int AS failed,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (confirmed_at - received_at)))
        FILTER (WHERE outcome IN ('ACCEPTED', 'CORRECTED') AND confirmed_at IS NOT NULL) AS median_seconds,
      COUNT(DISTINCT count_line_id)
        FILTER (WHERE outcome IN ('ACCEPTED', 'CORRECTED') AND count_line_id IS NOT NULL)::int AS whatsapp_lines,
      COUNT(DISTINCT count_line_id)
        FILTER (
          WHERE outcome IN ('ACCEPTED', 'CORRECTED')
            AND count_line_id IS NOT NULL
            AND file_url IS NOT NULL
            AND photo_removed_at IS NULL
        )::int AS lines_with_photo
    FROM stock_field_captures
    WHERE tenant_id = ${tenantId}
      AND received_at >= ${start}
      AND received_at < ${end}
  `;
  const row = rows[0];

  const total = int(row?.total);
  const accepted = int(row?.accepted);
  const corrected = int(row?.corrected);
  const whatsappLines = int(row?.whatsapp_lines);
  const median = row?.median_seconds === null || row?.median_seconds === undefined ? null : Number(row.median_seconds);

  return {
    photosAnalyzed: usage?.used ?? 0,
    medianSecondsToConfirm: median !== null && Number.isFinite(median) ? Math.round(median * 10) / 10 : null,
    acceptedFirstTimeRate: rate(accepted, accepted + corrected),
    proofCoverageRate: rate(int(row?.lines_with_photo), whatsappLines),
    unreadableRate: rate(int(row?.unreadable), total),
    unrecognizedRate: rate(int(row?.unrecognized), total),
    failedRate: rate(int(row?.failed), total)
  };
}

/** `GET …/whatsapp/overview`. */
export async function getWhatsappOverview(
  tenantId: string,
  month: string | undefined,
  now: Date = new Date()
): Promise<WhatsappOverview> {
  const quota = await getWhatsappQuotaState(tenantId, now);
  const measures = await computeWhatsappMeasures(tenantId, month ?? utcMonthOf(now));

  return {
    transport: env.WHATSAPP_INVENTORY_TRANSPORT,
    gatewayReady: gatewayReadyOf(),
    botNumber: env.WHATSAPP_INVENTORY_PUBLIC_NUMBER ?? null,
    simulatorAvailable: whatsappInventorySimulatorAvailable,
    vision: { provider: env.STOCK_VISION_PROVIDER, model: env.STOCK_VISION_MODEL },
    quota: {
      month: quota.month,
      used: quota.used,
      limit: quota.limit,
      source: quota.source,
      blocks: quota.blocks
    },
    measures
  };
}
