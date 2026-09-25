import React, { useCallback, useEffect, useState } from 'react';
import { App, Alert, Button, Card, Descriptions, Form, Input, InputNumber, Space, Spin, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import {
  PlatformSmsStatus,
  SmsMessageDto,
  TenantSmsOverview,
  getAdminTenantSms,
  getPlatformSmsStatus,
  sendAdminTenantSmsTest,
  testPlatformSmsConnection,
  updateAdminTenantSms
} from '../../services/sms-service';
import { onAntFormValidationFailed } from '../../lib/antFormFailure';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Paragraph, Text } = Typography;

/** 1 à 11 caractères alphanumériques, sans espace — format d'un nom d'expéditeur SMS Orange. */
const SENDER_NAME_PATTERN = /^[A-Za-z0-9]{1,11}$/;

interface SettingsFormValues {
  enabled: boolean;
  senderName?: string;
  monthlyQuota?: number | null;
}

interface TestFormValues {
  to: string;
  body?: string;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(activeLocale());
}

function readErrorMessage(e: any, fallback: string): string {
  return e?.response?.data?.message || e?.response?.data?.error || fallback;
}

/**
 * Onglet SMS de la fiche agence (super-admin) — Lot SMS-1.
 *
 * Trois blocs indépendants : le compte Orange unique de la plateforme (lecture
 * seule, avec un test de connexion), les réglages propres à cette agence
 * (activation, nom d'expéditeur, quota — modifiables ici, lus en seul par
 * l'agence dans `SmsSettingsCard`), et l'envoi d'un SMS de test.
 */
export const TenantSmsPanel: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const { message } = App.useApp();

  // ---- Compte de la plateforme -------------------------------------------
  const [platform, setPlatform] = useState<PlatformSmsStatus | null>(null);
  const [platformLoading, setPlatformLoading] = useState(true);
  const [platformTesting, setPlatformTesting] = useState(false);
  const [platformTestResult, setPlatformTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const loadPlatform = useCallback(async () => {
    setPlatformLoading(true);
    try {
      const data = await getPlatformSmsStatus();
      setPlatform(data);
    } catch (err: any) {
      message.error(readErrorMessage(err, t('Erreur lors du chargement du compte de la plateforme')));
    } finally {
      setPlatformLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void loadPlatform();
  }, [loadPlatform]);

  const handleTestPlatform = async () => {
    setPlatformTesting(true);
    setPlatformTestResult(null);
    try {
      const result = await testPlatformSmsConnection();
      setPlatformTestResult(result);
      if (result.ok) {
        message.success(t('Connexion réussie'));
      } else {
        message.error(result.message || t('La connexion a échoué'));
      }
    } catch (err: any) {
      const msg = readErrorMessage(err, t('Erreur lors du test de connexion'));
      setPlatformTestResult({ ok: false, message: msg });
      message.error(msg);
    } finally {
      setPlatformTesting(false);
    }
  };

  // ---- Réglages de l'agence -----------------------------------------------
  const [settingsForm] = Form.useForm<SettingsFormValues>();
  const [overview, setOverview] = useState<TenantSmsOverview | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const toFormValues = (data: TenantSmsOverview): SettingsFormValues => ({
    enabled: data.enabled,
    senderName: data.senderNameIsDefault ? '' : data.senderName,
    monthlyQuota: data.monthlyQuotaIsDefault ? null : data.monthlyQuota
  });

  const loadSettings = useCallback(async () => {
    if (!tenantId) return;
    setSettingsLoading(true);
    try {
      const data = await getAdminTenantSms(tenantId);
      setOverview(data);
      settingsForm.setFieldsValue(toFormValues(data));
    } catch (err: any) {
      message.error(readErrorMessage(err, t('Erreur lors du chargement des réglages SMS')));
    } finally {
      setSettingsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSaveSettings = async (values: SettingsFormValues) => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const payload = {
        enabled: values.enabled,
        senderName: values.senderName && values.senderName.trim() ? values.senderName.trim() : null,
        monthlyQuota: values.monthlyQuota === undefined || values.monthlyQuota === null ? null : values.monthlyQuota
      };
      const saved = await updateAdminTenantSms(tenantId, payload);
      setOverview(saved);
      settingsForm.setFieldsValue(toFormValues(saved));
      message.success(t('Réglages SMS enregistrés'));
    } catch (err: any) {
      message.error(readErrorMessage(err, t("Erreur lors de l'enregistrement des réglages SMS")));
    } finally {
      setSaving(false);
    }
  };

  // ---- Envoyer un SMS de test ----------------------------------------------
  const [testForm] = Form.useForm<TestFormValues>();
  const [sending, setSending] = useState(false);
  const [sentMessage, setSentMessage] = useState<SmsMessageDto | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const handleSendTest = async (values: TestFormValues) => {
    if (!tenantId) return;
    setSending(true);
    setSentMessage(null);
    setSendError(null);
    try {
      const result = await sendAdminTenantSmsTest(tenantId, { to: values.to, body: values.body || undefined });
      setSentMessage(result);
      if (result.status === 'FAILED') {
        // Le détail (`errorMessage`) est déjà affiché dans le résultat inline
        // ci-dessous : la notification reste générique pour ne pas le répéter.
        message.error(t("L'envoi a échoué"));
      } else {
        message.success(t('SMS de test envoyé'));
      }
      // Le quota consommé a pu changer : on relit les réglages.
      void loadSettings();
    } catch (err: any) {
      const msg = readErrorMessage(err, t("Erreur lors de l'envoi du SMS de test"));
      setSendError(msg);
      message.error(msg);
    } finally {
      setSending(false);
    }
  };

  const contractColumns: ColumnsType<NonNullable<PlatformSmsStatus['balance']>['contracts'][number]> = [
    { title: t('Pays'), dataIndex: 'country', key: 'country', render: (value?: string) => value || '—' },
    { title: t('Unités disponibles'), dataIndex: 'availableUnits', key: 'availableUnits', align: 'end' },
    {
      title: t('Expiration'),
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (value: string | null) => formatDate(value)
    },
    { title: t('Statut'), dataIndex: 'status', key: 'status', render: (value?: string) => value || '—' }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title={t('Compte de la plateforme')}
        extra={
          <Button icon={<ReloadOutlined aria-hidden />} onClick={() => void handleTestPlatform()} loading={platformTesting}>
            {t('Tester la connexion')}
          </Button>
        }
      >
        {platformLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <Spin />
          </div>
        ) : platform ? (
          <>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
              <Descriptions.Item label={t('Fournisseur')}>{platform.provider}</Descriptions.Item>
              <Descriptions.Item label={t('Configuré')}>
                <Tag color={platform.configured ? 'success' : 'error'}>
                  {platform.configured ? t('Oui') : t('Non')}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t("Adresse d'expédition")}>{platform.senderAddress || '—'}</Descriptions.Item>
              <Descriptions.Item label={t("Nom d'expéditeur de la plateforme")}>
                {platform.platformSenderName || '—'}
              </Descriptions.Item>
            </Descriptions>

            {platform.error ? (
              <Alert style={{ marginTop: 16 }} type="error" showIcon message={t('Solde')} description={platform.error} />
            ) : platform.balance ? (
              <div style={{ marginTop: 16 }}>
                <Paragraph strong style={{ marginBottom: 8 }}>
                  {t('Solde')}
                </Paragraph>
                <Table
                  rowKey={(record, index) => `${record.country ?? 'contrat'}-${index}`}
                  size="small"
                  columns={contractColumns}
                  dataSource={platform.balance.contracts}
                  pagination={false}
                  locale={{ emptyText: t('Aucun contrat') }}
                />
              </div>
            ) : null}

            {platformTestResult ? (
              <Alert
                style={{ marginTop: 16 }}
                type={platformTestResult.ok ? 'success' : 'error'}
                showIcon
                icon={platformTestResult.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                message={platformTestResult.message}
              />
            ) : null}
          </>
        ) : (
          <Alert type="error" showIcon message={t('Erreur lors du chargement du compte de la plateforme')} />
        )}
      </Card>

      <Card title={t("Réglages de l'agence")}>
        {settingsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <Spin />
          </div>
        ) : overview ? (
          <>
            <Form
              form={settingsForm}
              layout="vertical"
              onFinish={handleSaveSettings}
              onFinishFailed={onAntFormValidationFailed(settingsForm)}
            >
              <Form.Item label={t('Activé')} name="enabled" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item
                label={t("Nom d'expéditeur")}
                name="senderName"
                extra={t('1 à 11 caractères alphanumériques, sans espace. Laisser vide pour utiliser le nom de la plateforme.')}
                rules={[
                  {
                    validator: (_rule, value) => {
                      if (!value) return Promise.resolve();
                      if (!SENDER_NAME_PATTERN.test(value)) {
                        return Promise.reject(
                          new Error(t("Le nom d'expéditeur contient 1 à 11 caractères alphanumériques, sans espace"))
                        );
                      }
                      return Promise.resolve();
                    }
                  }
                ]}
              >
                <Input placeholder={t('Nom de la plateforme')} maxLength={11} />
              </Form.Item>
              <Form.Item
                label={t('Quota mensuel')}
                name="monthlyQuota"
                extra={t('Laisser vide pour utiliser le quota par défaut.')}
              >
                <InputNumber min={0} style={{ width: '100%' }} placeholder={t('Quota par défaut')} />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={saving}>
                {t('Enregistrer')}
              </Button>
            </Form>

            <Descriptions column={1} size="small" style={{ marginTop: 16 }} bordered>
              <Descriptions.Item label={t('Consommation du mois')}>
                {t('{{used}} sur {{quota}} SMS utilisés ce mois-ci', {
                  used: overview.usedThisMonth,
                  quota: overview.monthlyQuota
                })}
              </Descriptions.Item>
            </Descriptions>
          </>
        ) : (
          <Alert type="error" showIcon message={t('Erreur lors du chargement des réglages SMS')} />
        )}
      </Card>

      <Card title={t('Envoyer un SMS de test')}>
        <Form form={testForm} layout="vertical" onFinish={handleSendTest} onFinishFailed={onAntFormValidationFailed(testForm)}>
          <Form.Item
            label={t('Numéro')}
            name="to"
            extra={t('10 chiffres, ex. 0102030405')}
            rules={[{ required: true, message: t('Le numéro est requis') }]}
          >
            <Input placeholder="0102030405" />
          </Form.Item>
          <Form.Item label={t('Message')} name="body">
            <Input.TextArea rows={3} placeholder={t('Message de test facultatif')} />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<SendOutlined aria-hidden />} loading={sending}>
            {t('Envoyer')}
          </Button>
        </Form>

        {sendError ? (
          <Alert style={{ marginTop: 16 }} type="error" showIcon message={t('Erreur')} description={sendError} />
        ) : null}

        {sentMessage ? (
          <Alert
            style={{ marginTop: 16 }}
            type={sentMessage.status === 'FAILED' ? 'error' : 'success'}
            showIcon
            message={sentMessage.status === 'FAILED' ? t('Échec') : t('Envoyé')}
            description={
              sentMessage.status === 'FAILED' ? (
                <Text>{sentMessage.errorMessage || t("L'envoi a échoué")}</Text>
              ) : (
                <Text>{t('Vers {{to}}', { to: sentMessage.to })}</Text>
              )
            }
          />
        ) : null}
      </Card>
    </Space>
  );
};

export default TenantSmsPanel;
