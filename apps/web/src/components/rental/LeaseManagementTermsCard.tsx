import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  InputNumber,
  Radio,
  Select,
  Skeleton,
  Space,
  Switch,
  Tag,
  Typography
} from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import {
  FeeTerms,
  FeeTermsSource,
  LeaseManagementTerms,
  ManagementFeeBase,
  ManagementFeeMode,
  getLeaseManagementTerms,
  updateLeaseManagementTerms
} from '../../services/lease-management-terms-service';
import { formatMoney } from '../primitives';
import { t } from '../../i18n/t';

const { Text, Paragraph } = Typography;

/** Conditions par défaut proposées quand on active l'interrupteur sans rien avoir saisi encore. */
const DEFAULT_OVERRIDE: FeeTerms = {
  managementFeeMode: 'PERCENT',
  managementFeeRate: null,
  managementFeeFixedAmount: null,
  managementFeeBase: 'RENT_ONLY'
};

interface LeaseManagementTermsCardProps {
  tenantId: string;
  leaseId: string;
}

/**
 * Honoraires de gestion et gestionnaire d'un bail.
 *
 * Affiche le taux réellement applicable (bail, propriétaire ou agence, avec
 * son origine) et permet de fixer des conditions propres à ce bail. Voir
 * contrat lot 2 §4 : le taux se résout dans l'ordre bail > propriétaire >
 * agence, et vaut `NONE` si rien n'est paramétré nulle part.
 */
export const LeaseManagementTermsCard: React.FC<LeaseManagementTermsCardProps> = ({ tenantId, leaseId }) => {
  const { message } = App.useApp();
  const [terms, setTerms] = useState<LeaseManagementTerms | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [agentUserId, setAgentUserId] = useState<string | null>(null);
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [override, setOverride] = useState<FeeTerms>(DEFAULT_OVERRIDE);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLeaseManagementTerms(tenantId, leaseId);
      setTerms(data);
      setAgentUserId(data.agentUserId);
      setOverrideEnabled(data.override !== null);
      setOverride(data.override ?? DEFAULT_OVERRIDE);
    } catch (e: any) {
      setError(e?.response?.data?.message || t('Erreur lors du chargement des honoraires'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, leaseId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await updateLeaseManagementTerms(tenantId, leaseId, {
        override: overrideEnabled ? override : null,
        agentUserId
      });
      setTerms(data);
      setAgentUserId(data.agentUserId);
      setOverrideEnabled(data.override !== null);
      setOverride(data.override ?? DEFAULT_OVERRIDE);
      message.success(t('Honoraires enregistrés'));
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('Erreur lors de la sauvegarde'));
    } finally {
      setSaving(false);
    }
  };

  const sourceLabel = (source: FeeTermsSource | 'NONE'): string => {
    switch (source) {
      case 'LEASE':
        return t('Conditions du bail');
      case 'OWNER':
        return t('Conditions du propriétaire');
      case 'AGENCY':
        return t("Paramètres de l'agence");
      default:
        return t('Aucun taux fixé');
    }
  };

  const renderEffective = () => {
    if (!terms) return null;
    const { effective } = terms;

    if (effective.source === 'NONE') {
      return (
        <Alert
          type="info"
          showIcon
          message={sourceLabel('NONE')}
          description={<Link to={`/tenant/${tenantId}/settings/finance`}>{t('Fixer le taux d’honoraires')}</Link>}
        />
      );
    }

    return (
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label={t('Origine')}>
          <Tag color="blue">{sourceLabel(effective.source)}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label={t('Mode')}>
          {effective.managementFeeMode === 'PERCENT' ? t('Pourcentage') : t('Forfait par échéance')}
        </Descriptions.Item>
        {effective.managementFeeMode === 'PERCENT' ? (
          <>
            <Descriptions.Item label={t('Taux')}>{effective.managementFeeRate ?? '-'} %</Descriptions.Item>
            <Descriptions.Item label={t('Assiette')}>
              {effective.managementFeeBase === 'RENT_ONLY' ? t('Le loyer seul') : t("Tout l'encaissé")}
            </Descriptions.Item>
          </>
        ) : (
          <Descriptions.Item label={t('Forfait')}>{formatMoney(effective.managementFeeFixedAmount)}</Descriptions.Item>
        )}
      </Descriptions>
    );
  };

  if (loading) {
    return (
      <Card title={t('Honoraires et gestionnaire')}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </Card>
    );
  }

  if (error) {
    return (
      <Card title={t('Honoraires et gestionnaire')}>
        <Alert
          type="error"
          showIcon
          message={error}
          action={
            <Button size="small" onClick={() => void load()}>
              {t('Réessayer')}
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card title={t('Honoraires et gestionnaire')}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <Text strong>{t('Gestionnaire du bail')}</Text>
          <div style={{ marginTop: 8 }}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('Aucun gestionnaire')}
              value={agentUserId ?? undefined}
              onChange={value => setAgentUserId(value ?? null)}
              onClear={() => setAgentUserId(null)}
              style={{ width: '100%', maxWidth: 360 }}
              options={(terms?.agents ?? []).map(agent => ({ value: agent.userId, label: agent.fullName }))}
            />
          </div>
        </div>

        <div>
          <Text strong>{t('Honoraires applicables')}</Text>
          <div style={{ marginTop: 8 }}>{renderEffective()}</div>
        </div>

        <div>
          <Space align="center">
            <Switch checked={overrideEnabled} onChange={setOverrideEnabled} />
            <Text strong>{t('Conditions propres à ce bail')}</Text>
          </Space>
        </div>

        {overrideEnabled ? (
          <Space direction="vertical" size="middle" style={{ width: '100%', paddingInlineStart: 8 }}>
            <div>
              <Text>{t('Mode')}</Text>
              <div style={{ marginTop: 4 }}>
                <Radio.Group
                  value={override.managementFeeMode}
                  onChange={e => setOverride({ ...override, managementFeeMode: e.target.value as ManagementFeeMode })}
                >
                  <Radio value="PERCENT">{t('Pourcentage')}</Radio>
                  <Radio value="FIXED">{t('Forfait par échéance')}</Radio>
                </Radio.Group>
              </div>
            </div>

            {override.managementFeeMode === 'PERCENT' ? (
              <>
                <div>
                  <Text>{t("Taux d'honoraires (%)")}</Text>
                  <div style={{ marginTop: 4 }}>
                    <InputNumber
                      min={0}
                      max={100}
                      value={override.managementFeeRate ?? undefined}
                      onChange={value => setOverride({ ...override, managementFeeRate: value ?? null })}
                      style={{ width: '100%', maxWidth: 240 }}
                    />
                  </div>
                </div>
                <div>
                  <Text>{t('Calculés sur')}</Text>
                  <div style={{ marginTop: 4 }}>
                    <Radio.Group
                      value={override.managementFeeBase}
                      onChange={e =>
                        setOverride({ ...override, managementFeeBase: e.target.value as ManagementFeeBase })
                      }
                    >
                      <Radio value="RENT_ONLY">{t('Le loyer seul')}</Radio>
                      <Radio value="ALL_COLLECTED">{t("Tout l'encaissé")}</Radio>
                    </Radio.Group>
                  </div>
                </div>
              </>
            ) : (
              <div>
                <Text>{t('Forfait par échéance (FCFA)')}</Text>
                <div style={{ marginTop: 4 }}>
                  <InputNumber
                    min={0}
                    value={override.managementFeeFixedAmount ?? undefined}
                    onChange={value => setOverride({ ...override, managementFeeFixedAmount: value ?? null })}
                    style={{ width: '100%', maxWidth: 240 }}
                  />
                </div>
              </div>
            )}
          </Space>
        ) : null}

        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {t(
            'Les honoraires sont calculés à chaque encaissement et figés : un changement de taux ne modifie pas les honoraires déjà comptés.'
          )}
        </Paragraph>

        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()}>
          {t('Enregistrer')}
        </Button>
      </Space>
    </Card>
  );
};
