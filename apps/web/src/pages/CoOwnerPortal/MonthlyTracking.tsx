import React, { useEffect, useMemo, useState } from 'react';
import { Card, Row, Col, Select, Space, Tooltip, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { formatMoney, MoneyValue, SkeletonList, StateBlock } from '../../components/primitives';
import { t } from '../../i18n/t';
import {
  listMyLots,
  getCoOwnerLotMonthlyTracking,
  type CoOwnerMonthStatus
} from '../../services/coowner-portal-service';
import { portalErrorMessage } from './portal-error';

const { Title, Text } = Typography;

const MONTH_LABELS = [
  t('Janv.'),
  t('Févr.'),
  t('Mars'),
  t('Avr.'),
  t('Mai'),
  t('Juin'),
  t('Juil.'),
  t('Août'),
  t('Sept.'),
  t('Oct.'),
  t('Nov.'),
  t('Déc.')
];

/**
 * Couleurs et libellés d'un mois — même convention que la grille de gestion
 * (`SyndicMonthlyTracking.tsx`, lot S2). Pas de composant partagé : celui-ci
 * ne rend qu'un seul lot à la fois, la grille de gestion en rend plusieurs.
 */
const STATUS_CONFIG: Record<CoOwnerMonthStatus, { color: string; textColor: string; label: string }> = {
  PAID: {
    color: 'var(--color-success-bg, #e6f7e9)',
    textColor: 'var(--color-success-text, #237a3f)',
    label: t('Réglé')
  },
  PARTIAL: {
    color: 'var(--color-warning-bg, #fff3e0)',
    textColor: 'var(--color-warning-text, #ad6800)',
    label: t('Partiel')
  },
  DUE: { color: 'var(--color-info-bg, #e6f0ff)', textColor: 'var(--color-info-text, #1d4ed8)', label: t('Dû') },
  OVERDUE: {
    color: 'var(--color-error-bg, #fde8e8)',
    textColor: 'var(--color-error-text, #c0202c)',
    label: t('En retard')
  },
  NONE: { color: 'transparent', textColor: 'var(--text-secondary, #999)', label: t('—') }
};

function yearRange(current: number, minYear?: number): number[] {
  const years: number[] = [];
  const floor = minYear ?? current - 3;
  for (let year = floor; year <= current + 1; year += 1) years.push(year);
  return years;
}

/** Année et mois (1-12) d'une date `AAAA-MM-JJ`. */
function parseIsoDay(value: string): { year: number; month: number } {
  const [year, month] = value.split('-').map(Number);
  return { year, month };
}

/** Vrai si ce mois précède l'acquisition du lot : le mois de l'ancien propriétaire, jamais montré ici. */
function isBeforeOwnership(year: number, month: number, ownedSince: string): boolean {
  const owned = parseIsoDay(ownedSince);
  return year < owned.year || (year === owned.year && month < owned.month);
}

/**
 * « Suivi mensuel » (lot S5, besoin 2) : pour un lot du copropriétaire, les
 * douze mois de l'exercice — réglé, partiel, dû ou en retard —, les totaux
 * et l'avance disponible. Choix du lot et de l'exercice.
 */
export default function CoOwnerMonthlyTracking() {
  const [lotId, setLotId] = useState<string | undefined>(undefined);
  const [year, setYear] = useState(() => new Date().getFullYear());

  const lots = useQuery({ queryKey: ['coowner-portal', 'lots'], queryFn: () => listMyLots() });

  useEffect(() => {
    if (!lotId && lots.data && lots.data.length > 0) setLotId(lots.data[0].id);
  }, [lotId, lots.data]);

  const lotOptions = useMemo(
    () =>
      (lots.data ?? []).map(lot => ({ value: lot.id, label: t('Lot {{lotNumber}}', { lotNumber: lot.lotNumber }) })),
    [lots.data]
  );

  const tracking = useQuery({
    queryKey: ['coowner-portal', 'monthly-tracking', lotId ?? null, year],
    queryFn: () => getCoOwnerLotMonthlyTracking(lotId as string, year),
    enabled: Boolean(lotId)
  });

  const ownedSinceYear = tracking.data ? parseIsoDay(tracking.data.ownedSince).year : undefined;

  // Un lot acquis après l'année choisie (par ex. après un changement de lot) :
  // l'API répondrait 404 sur une année qui n'existe pas pour ce copropriétaire.
  useEffect(() => {
    if (ownedSinceYear !== undefined && year < ownedSinceYear) setYear(ownedSinceYear);
  }, [ownedSinceYear, year]);

  const currency = tracking.data?.currency;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={2}>{t('Suivi mensuel')}</Title>
        <Text type="secondary">{t('Mois par mois, pour un lot : réglé, partiel, dû ou en retard.')}</Text>
      </div>

      <Space wrap size="middle">
        <Select
          style={{ minWidth: 200 }}
          placeholder={t('Choisir un lot')}
          options={lotOptions}
          value={lotId}
          onChange={value => setLotId(value)}
          aria-label={t('Lot')}
        />
        <Select
          style={{ minWidth: 120 }}
          value={year}
          onChange={value => setYear(value)}
          options={yearRange(new Date().getFullYear(), ownedSinceYear).map(candidate => ({
            value: candidate,
            label: String(candidate)
          }))}
          aria-label={t('Exercice')}
        />
      </Space>

      {lots.data && lots.data.length === 0 ? (
        <StateBlock variant="empty" description={t("Aucun lot n'est ouvert à votre compte pour le moment.")} />
      ) : !lotId || tracking.isPending ? (
        <SkeletonList rows={3} />
      ) : tracking.error ? (
        <StateBlock
          variant="error"
          description={portalErrorMessage(tracking.error, t('Impossible de charger le suivi mensuel.'))}
          actions={[{ label: t('Réessayer'), onClick: () => void tracking.refetch(), primary: true }]}
        />
      ) : tracking.data ? (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={8}>
              <Card>
                <Text type="secondary">{t('Dû sur l’exercice')}</Text>
                <div style={{ marginTop: 4 }}>
                  <MoneyValue value={tracking.data.totals.due} currency={currency} />
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Text type="secondary">{t('Réglé')}</Text>
                <div style={{ marginTop: 4 }}>
                  <MoneyValue value={tracking.data.totals.paid} currency={currency} />
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Text type="secondary">{t('Avance disponible')}</Text>
                <div style={{ marginTop: 4 }}>
                  <MoneyValue value={tracking.data.advance} currency={currency} />
                </div>
              </Card>
            </Col>
          </Row>

          <Card
            title={t('Lot {{lotNumber}} — {{syndicate}}', {
              lotNumber: tracking.data.lot.lotNumber,
              syndicate: tracking.data.syndicate.name ?? '—'
            })}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
                <thead>
                  <tr>
                    {MONTH_LABELS.map(label => (
                      <th key={label} style={{ textAlign: 'center', padding: 8, minWidth: 60 }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {tracking.data.months.map(cell => {
                      const beforeOwnership = isBeforeOwnership(
                        tracking.data.year,
                        cell.month,
                        tracking.data.ownedSince
                      );
                      const config = STATUS_CONFIG[cell.status];
                      const tooltip = beforeOwnership
                        ? t('Avant votre acquisition')
                        : t('{{label}} — dû {{due}}, réglé {{paid}}', {
                            label: config.label,
                            due: formatMoney(cell.due, { currency }),
                            paid: formatMoney(cell.paid, { currency })
                          });
                      return (
                        <td key={cell.month} style={{ padding: 4, textAlign: 'center' }}>
                          <Tooltip title={tooltip}>
                            <div
                              role="img"
                              aria-label={tooltip}
                              style={{
                                backgroundColor: beforeOwnership ? 'var(--surface-disabled, #f5f5f5)' : config.color,
                                color: beforeOwnership ? 'var(--text-disabled, #bbb)' : config.textColor,
                                borderRadius: 6,
                                padding: '4px 2px',
                                fontSize: 12,
                                fontWeight: 600,
                                lineHeight: 1.2
                              }}
                            >
                              {beforeOwnership ? '·' : config.label}
                            </div>
                          </Tooltip>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            <Space wrap size={16} style={{ marginTop: 16 }} aria-label={t('Légende')}>
              {(Object.keys(STATUS_CONFIG) as CoOwnerMonthStatus[]).map(status => {
                const config = STATUS_CONFIG[status];
                return (
                  <Space key={status} size={6}>
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-block',
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        backgroundColor: config.color,
                        border: status === 'NONE' ? '1px solid var(--border-color, #ccc)' : undefined
                      }}
                    />
                    <Text>{config.label}</Text>
                  </Space>
                );
              })}
            </Space>
          </Card>
        </>
      ) : null}
    </Space>
  );
}
