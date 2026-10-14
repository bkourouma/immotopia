import React from 'react';
import { Link } from 'react-router-dom';
import { Card, Col, Progress, Row, Typography } from 'antd';
import type { WhatsappOverview } from '../../../../types/finance-stock-whatsapp-types';
import { StatusTag } from '../../../primitives/StatusTag';
import { formatNumber } from '../../../../i18n/format';
import { t } from '../../../../i18n/t';
import type { WhatsappTone } from './whatsapp-labels';

export interface WhatsappOverviewCardsProps {
  tenantId: string;
  overview: WhatsappOverview;
  /** L'appelant peut ouvrir l'écran d'abonnement (lien « Option non souscrite »). */
  canOpenSubscription?: boolean;
}

/** Seuil à partir duquel la carte du quota passe en ton `warning`. */
const QUOTA_WARNING_RATIO = 0.8;

function gatewayDisplay(overview: WhatsappOverview): { label: string; tone: WhatsappTone } {
  switch (overview.transport) {
    case 'meta':
      return overview.gatewayReady === false
        ? { label: t('Configuration incomplète'), tone: 'warning' }
        : { label: t('Connectée à WhatsApp'), tone: 'success' };
    case 'log':
      return { label: t('Mode recette : aucun message n’est envoyé, utilisez le simulateur'), tone: 'info' };
    case 'disabled':
    default:
      return { label: t('Désactivée sur ce serveur'), tone: 'neutral' };
  }
}

function quotaSourceText(overview: WhatsappOverview): string {
  const { quota } = overview;
  switch (quota.source) {
    case 'OPTION':
      return t('{{blocks}} bloc(s) de 500 photos', { blocks: quota.blocks ?? 0 });
    case 'WARN_FALLBACK':
      return t('Option non souscrite : quota provisoire de {{limit}} photos, le temps de la mise en place', {
        limit: quota.limit
      });
    case 'OFF_FALLBACK':
      return t('Quota provisoire de {{limit}} photos', { limit: quota.limit });
    case 'NONE':
    default:
      return t('Option non souscrite. Le bot refuse les photos.');
  }
}

/**
 * En-tête commun de l'onglet WhatsApp (ecrans §5.1) : passerelle, quota du
 * mois, analyse. Ne montre que ce que `GET …/overview` rend.
 */
export const WhatsappOverviewCards: React.FC<WhatsappOverviewCardsProps> = ({
  tenantId,
  overview,
  canOpenSubscription = false
}) => {
  const passerelle = gatewayDisplay(overview);
  const { quota } = overview;
  const ratio = quota.limit > 0 ? quota.used / quota.limit : 0;
  const alerte = quota.limit > 0 && ratio >= QUOTA_WARNING_RATIO;
  const visionCoupee = !overview.vision.provider || overview.vision.provider === 'disabled';

  return (
    <Row gutter={[16, 16]} style={{ marginBlockEnd: 16 }}>
      <Col xs={24} md={8}>
        <Card title={t('Passerelle')} size="small" style={{ height: '100%' }}>
          <StatusTag status={`WHATSAPP_${overview.transport}`} tone={passerelle.tone} label={passerelle.label} />
          {overview.botNumber && (
            <div style={{ marginBlockStart: 12 }}>
              <Typography.Text type="secondary" style={{ display: 'block' }}>
                {t('Numéro du bot')}
              </Typography.Text>
              <Typography.Text strong style={{ fontSize: 22 }} copyable={{ text: overview.botNumber }}>
                {overview.botNumber}
              </Typography.Text>
            </div>
          )}
        </Card>
      </Col>

      <Col xs={24} md={8}>
        <Card title={t('Photos analysées ce mois-ci')} size="small" style={{ height: '100%' }}>
          <Typography.Text strong style={{ fontSize: 22 }} data-testid="whatsapp-quota-usage">
            {formatNumber(quota.used)} / {formatNumber(quota.limit)}
          </Typography.Text>
          <Progress
            percent={Math.min(100, Math.round(ratio * 100))}
            status="normal"
            strokeColor={alerte ? 'var(--color-warning, #faad14)' : undefined}
            showInfo={false}
            aria-label={t('Part du quota consommée')}
          />
          <Typography.Text type={alerte || quota.source === 'NONE' ? 'warning' : 'secondary'}>
            {quotaSourceText(overview)}
          </Typography.Text>
          {quota.source === 'NONE' && canOpenSubscription && (
            <div style={{ marginBlockStart: 8 }}>
              <Link to={`/tenant/${tenantId}/settings/abonnement`}>{t('Voir l’abonnement')}</Link>
            </div>
          )}
        </Card>
      </Col>

      <Col xs={24} md={8}>
        <Card title={t('Analyse')} size="small" style={{ height: '100%' }}>
          {visionCoupee ? (
            <Typography.Text type="warning">
              {t(
                'L’analyse des photos est désactivée sur ce serveur : le bot répondra qu’il ne peut pas analyser les photos.'
              )}
            </Typography.Text>
          ) : (
            <>
              <Typography.Text style={{ display: 'block' }}>
                {t('Fournisseur : {{provider}}', { provider: overview.vision.provider ?? '—' })}
              </Typography.Text>
              <Typography.Text type="secondary">
                {t('Modèle : {{model}}', { model: overview.vision.model ?? '—' })}
              </Typography.Text>
            </>
          )}
        </Card>
      </Col>
    </Row>
  );
};

export default WhatsappOverviewCards;
