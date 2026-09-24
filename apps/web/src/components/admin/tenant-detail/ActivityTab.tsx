import React, { useEffect, useState } from 'react';
import { App, Card, List, Row, Col, Spin, Typography } from 'antd';
import { getTenantActivity, TenantActivity } from '../../../services/admin-subscription-service';
import { StatCard, StatusTag } from '../../primitives';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';

const { Text } = Typography;

/**
 * Onglet Activité de la fiche agence (lot G4).
 *
 * Branche `GET /api/admin/tenants/:tenantId/activity`, jamais affiché jusque
 * là (constat #10 du plan multi-tenant). Ne pas confondre avec
 * `GET .../stats`, déjà utilisé par l'onglet Statistiques : deux endpoints,
 * deux formes de réponse différentes.
 */

function formatDateTime(value: string | null | undefined): string {
  if (!value) return t('Jamais');
  return new Date(value).toLocaleDateString(activeLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export const ActivityTab: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const { message } = App.useApp();
  const [activity, setActivity] = useState<TenantActivity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTenantActivity(tenantId)
      .then(data => {
        if (!cancelled) setActivity(data);
      })
      .catch((err: any) => {
        if (!cancelled) message.error(err.response?.data?.message || t("Erreur lors du chargement de l'activité"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
        <Spin />
      </div>
    );
  }

  if (!activity) {
    return <p>{t("Aucune donnée d'activité pour cette agence.")}</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <StatCard label={t('Collaborateurs')} value={activity.memberships.total} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard label={t('Collaborateurs actifs')} value={activity.memberships.active} tone="positive" />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard label={t('Collaborateurs désactivés')} value={activity.memberships.disabled} tone="warning" />
        </Col>
      </Row>

      <Card title={t('Dernière connexion')}>
        <Text>{formatDateTime(activity.lastLogin)}</Text>
      </Card>

      {activity.subscription && (
        <Card title={t('Abonnement')}>
          <p>
            {t('Offre {{value}}', { value: activity.subscription.plan })} —{' '}
            <StatusTag status={activity.subscription.status} />
          </p>
          <p>
            {t('Fin de la période en cours : {{value}}', {
              value: formatDateTime(activity.subscription.currentPeriodEnd)
            })}
          </p>
        </Card>
      )}

      <Card title={t('Modules activés ({{value}})', { value: activity.modules.enabled })}>
        <List
          size="small"
          dataSource={activity.modules.modules}
          locale={{ emptyText: t('Aucun module activé') }}
          renderItem={item => (
            <List.Item>
              <Text>{item.key}</Text>
              <Text type="secondary">{formatDateTime(item.enabledAt)}</Text>
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
};
