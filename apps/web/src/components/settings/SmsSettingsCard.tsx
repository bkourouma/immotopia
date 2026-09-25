import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Descriptions, Progress, Spin, Tag, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { TenantSmsOverview, getTenantSmsOverview } from '../../services/sms-service';
import { t } from '../../i18n/t';

const { Paragraph, Text } = Typography;

export interface SmsSettingsCardProps {
  tenantId: string;
}

/**
 * Carte « SMS » — Lot SMS-1, compte Orange unique au nom d'ImmoTopia.
 *
 * Lecture seule côté agence : le compte SMS, son activation, le nom
 * d'expéditeur et le quota mensuel sont fixés par le super-admin
 * (`TenantSmsPanel`). L'agence ne saisit aucun identifiant Orange, elle
 * consulte seulement l'état de son quota.
 */
export const SmsSettingsCard: React.FC<SmsSettingsCardProps> = ({ tenantId }) => {
  const [overview, setOverview] = useState<TenantSmsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getTenantSmsOverview(tenantId);
      setOverview(data);
    } catch (e: any) {
      setError(
        e?.response?.data?.message || e?.response?.data?.error || t('Erreur lors du chargement des informations')
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  if (loading) {
    return (
      <Card title={t('SMS')} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (error && !overview) {
    return (
      <Card title={t('SMS')} style={{ marginBottom: 16 }}>
        <Alert
          type="error"
          showIcon
          message={t('Erreur')}
          description={error}
          action={
            <Button size="small" onClick={() => void load()}>
              {t('Réessayer')}
            </Button>
          }
        />
      </Card>
    );
  }

  if (!overview) return null;

  const quotaPercent =
    overview.monthlyQuota > 0 ? Math.min(100, Math.round((overview.usedThisMonth / overview.monthlyQuota) * 100)) : 0;

  return (
    <Card title={t('SMS')} style={{ marginBottom: 16 }}>
      <Paragraph type="secondary">
        {t("Permet à l'agence d'envoyer des SMS à ses locataires et propriétaires, via le compte Orange d'ImmoTopia.")}
      </Paragraph>

      {!overview.platformConfigured ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t("Le compte SMS de la plateforme n'est pas configuré")}
        />
      ) : null}

      {overview.provider === 'log' ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t("Mode test : aucun SMS n'est réellement envoyé.")}
        />
      ) : null}

      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label={t('Statut')}>
          <Tag color={overview.enabled ? 'success' : 'default'}>
            {overview.enabled ? t('Activé') : t('Désactivé')}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label={t("Nom d'expéditeur")}>
          {overview.senderName ? <Text>{overview.senderName}</Text> : <Text type="secondary">—</Text>}
          {overview.senderNameIsDefault ? (
            <Text type="secondary" style={{ marginInlineStart: 8 }}>
              {t('(nom de la plateforme)')}
            </Text>
          ) : null}
        </Descriptions.Item>
        <Descriptions.Item label={t('Quota mensuel')}>
          <div>
            <div>
              <Text>
                {t('{{used}} sur {{quota}} SMS utilisés ce mois-ci', {
                  used: overview.usedThisMonth,
                  quota: overview.monthlyQuota
                })}
              </Text>
              {overview.monthlyQuotaIsDefault ? (
                <Text type="secondary" style={{ marginInlineStart: 8 }}>
                  {t('(quota par défaut)')}
                </Text>
              ) : null}
            </div>
            <Progress percent={quotaPercent} size="small" status={quotaPercent >= 100 ? 'exception' : 'normal'} />
            <Text type="secondary">{t('{{remaining}} SMS restants', { remaining: overview.remainingThisMonth })}</Text>
          </div>
        </Descriptions.Item>
      </Descriptions>

      <Alert
        style={{ marginTop: 16 }}
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message={t(
          "Le compte SMS est géré par ImmoTopia. Pour changer le nom d'expéditeur ou le quota, contactez le support."
        )}
      />
    </Card>
  );
};

export default SmsSettingsCard;
