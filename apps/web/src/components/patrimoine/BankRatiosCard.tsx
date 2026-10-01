import React, { useId } from 'react';
import { Card, Col, Row, Statistic, Tooltip, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import type { BankRatio, BankRatioReason, BankRatios } from '../../types/patrimoine-types';
import { t } from '../../i18n/t';
import { formatDscr, formatYieldPercent } from './patrimoine-format';

interface Props {
  ratios: BankRatios;
  loading?: boolean;
}

function reasonLabel(reason: BankRatioReason | null): string | null {
  switch (reason) {
    case 'NO_DEBT_SERVICE':
      return t('Aucune mensualité à venir sur les 12 prochains mois');
    case 'NO_ACTIVE_LOAN':
      return t('Aucun emprunt actif sur ce bien');
    case 'NO_VALUE':
      return t('Aucune valorisation renseignée');
    case 'NO_COST_BASIS':
      return t("Renseignez le prix d'acquisition dans une valorisation");
    case 'NO_EQUITY':
      return t('Bien financé à 100 % : fonds propres nuls');
    case 'NOT_CONVERGENT':
      return t('Calcul impossible avec ces hypothèses');
    default:
      return null;
  }
}

/** Titre d'un ratio suivi d'une icône d'information dont l'info-bulle définit le ratio. */
const VISUELLEMENT_MASQUE: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap'
};

/**
 * L'info-bulle s'ouvre au survol ET au focus clavier ; la définition est aussi
 * dans un texte masqué relié par `aria-describedby`, lisible sans ouvrir l'info-bulle.
 */
const RatioTitle: React.FC<{ label: string; definition: string }> = ({ label, definition }) => {
  const id = useId();
  return (
    <span>
      {label}{' '}
      <Tooltip title={definition} trigger={['hover', 'focus']}>
        <InfoCircleOutlined
          tabIndex={0}
          aria-label={t('Définition : {{ratio}}', { ratio: label })}
          aria-describedby={id}
        />
      </Tooltip>
      <span id={id} style={VISUELLEMENT_MASQUE}>
        {definition}
      </span>
    </span>
  );
};

/**
 * Un ratio indéterminable (`value: null`) s'écrit « — » avec sa raison : ne
 * jamais afficher 0, qui inventerait une couverture ou un rendement nul.
 */
const RatioStat: React.FC<{
  label: string;
  definition: string;
  ratio: BankRatio | undefined;
  format: (value: number) => string;
  loading?: boolean;
}> = ({ label, definition, ratio, format, loading }) => {
  const title = <RatioTitle label={label} definition={definition} />;
  const value = ratio?.value;
  if (value === null || value === undefined || !Number.isFinite(value)) {
    const reason = ratio ? reasonLabel(ratio.reason) : null;
    return (
      <>
        <Statistic title={title} value="—" loading={loading} />
        {reason && !loading ? <Typography.Text type="secondary">{reason}</Typography.Text> : null}
      </>
    );
  }
  return <Statistic title={title} value={format(value)} loading={loading} />;
};

export const BankRatiosCard: React.FC<Props> = ({ ratios, loading }) => (
  <Card title={t('Ratios bancaires')}>
    <Row gutter={[16, 16]}>
      <Col xs={24} md={6}>
        <RatioStat
          label={t('DSCR (couverture de la dette)')}
          definition={t(
            "DSCR = (loyers annuels effectifs, vacance déduite − charges d'exploitation) / mensualités d'emprunt des 12 prochains mois."
          )}
          ratio={ratios.dscr}
          format={formatDscr}
          loading={loading}
        />
      </Col>
      <Col xs={24} md={6}>
        <RatioStat
          label={t("LTV (ratio d'endettement)")}
          definition={t('LTV = capital restant dû / valeur estimée du bien.')}
          ratio={ratios.ltv}
          format={formatYieldPercent}
          loading={loading}
        />
      </Col>
      <Col xs={24} md={6}>
        <RatioStat
          label={t('Cash-on-cash')}
          definition={t(
            'Cash-on-cash = cash-flow net annuel après mensualités / fonds propres investis (coût de revient − capital emprunté).'
          )}
          ratio={ratios.cashOnCash}
          format={formatYieldPercent}
          loading={loading}
        />
      </Col>
      <Col xs={24} md={6}>
        <RatioStat
          label={t('TRI (taux de rentabilité interne)')}
          definition={t(
            "TRI = taux de rentabilité interne sur l'horizon projeté, avant financement, avec pour valeur terminale la valeur projetée."
          )}
          ratio={ratios.irr}
          format={formatYieldPercent}
          loading={loading}
        />
      </Col>
    </Row>
  </Card>
);
