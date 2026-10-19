import React, { useCallback, useEffect, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  Radio,
  Row,
  Space,
  Spin,
  Switch,
  Tag,
  Typography
} from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, KeyOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  GatewayMode,
  SyndicPaymentGatewaySettings,
  SyndicPaymentGatewayTestResult,
  SyndicProviderBalance,
  UpdateSyndicPaymentGatewayBody,
  getSyndicGatewaySettings,
  getSyndicProviderBalance,
  testSyndicGatewayConnection,
  updateSyndicGatewaySettings
} from '../../../services/syndic-online-payment-service';
import { formatMoney } from '../../primitives';
import { onAntFormValidationFailed } from '../../../lib/antFormFailure';
import { t } from '../../../i18n/t';
import { apiErrorCode, apiErrorMessage, formatDateTime } from './helpers';
import { displayCurrency } from '../../../utils/syndic-currency';

const { Text, Paragraph } = Typography;

interface FormValues {
  mode: GatewayMode;
  isActive: boolean;
  merchantId: string | null;
  apiKeyInput: string;
}

export interface GatewayConfigCardProps {
  tenantId: string;
  syndicId: string;
  /** Change à chaque opération comptable (reversement, décision) : relit les soldes sans toucher au formulaire. */
  refreshToken?: number;
  /** Prévient la page du solde du 5525, utilisé pour borner un reversement. */
  onSettingsLoaded?: (settings: SyndicPaymentGatewaySettings) => void;
  /** Droits `SYNDIC_EDIT` et `TENANT_SETTINGS_EDIT` : sans eux, la configuration reste en lecture seule. */
  canEditSettings: boolean;
}

/**
 * Configuration du compte marchand PaySecureHub d'UNE copropriété (spec 042,
 * contrat §1.1 à §1.4). Aucun repli sur le compte de l'agence : tant que cette
 * configuration n'est pas utilisable, les copropriétaires ne voient pas « Payer ».
 *
 * La clé API est en écriture seule : jamais préremplie, seul `apiKeyLast4`
 * s'affiche. Le champ reste inactif tant que « Remplacer la clé » n'a pas été
 * cliqué, pour qu'un simple enregistrement n'efface pas la clé.
 */
export const GatewayConfigCard: React.FC<GatewayConfigCardProps> = ({
  tenantId,
  syndicId,
  refreshToken = 0,
  onSettingsLoaded,
  canEditSettings
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [settings, setSettings] = useState<SyndicPaymentGatewaySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ code?: string; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<SyndicPaymentGatewayTestResult | null>(null);
  const [editingApiKey, setEditingApiKey] = useState(false);
  const [providerBalance, setProviderBalance] = useState<SyndicProviderBalance | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const mode = Form.useWatch('mode', form);

  const toFormValues = (data: SyndicPaymentGatewaySettings): FormValues => ({
    mode: data.mode,
    isActive: data.isActive,
    merchantId: data.merchantId,
    apiKeyInput: ''
  });

  const loadProviderBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      setProviderBalance(await getSyndicProviderBalance(tenantId, syndicId));
    } catch (e) {
      setProviderBalance({
        available: false,
        balance: null,
        message: apiErrorMessage(e, t('Solde fournisseur indisponible'))
      });
    } finally {
      setBalanceLoading(false);
    }
  }, [tenantId, syndicId]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getSyndicGatewaySettings(tenantId, syndicId);
      setSettings(data);
      setTestResult(null);
      setEditingApiKey(!data.apiKeyConfigured);
      form.setFieldsValue(toFormValues(data));
      onSettingsLoaded?.(data);
      void loadProviderBalance();
    } catch (e) {
      setLoadError(apiErrorMessage(e, t('Erreur lors du chargement des informations')));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, syndicId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Après un reversement ou une décision : seuls les soldes bougent. Un `load()`
  // complet effacerait les saisies non enregistrées du formulaire.
  useEffect(() => {
    if (refreshToken === 0) return;
    getSyndicGatewaySettings(tenantId, syndicId)
      .then(data => {
        setSettings(courant => (courant ? { ...courant, collectionAccount: data.collectionAccount } : data));
        onSettingsLoaded?.(data);
      })
      .catch(() => undefined);
    void loadProviderBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const handleSubmit = async (values: FormValues) => {
    setSaving(true);
    setSaveError(null);
    try {
      const payload: UpdateSyndicPaymentGatewayBody = {
        mode: values.mode,
        isActive: values.isActive,
        merchantId: values.merchantId?.trim() ? values.merchantId.trim() : null
      };
      // La clé ne part que si elle a été saisie : absente du corps, le serveur la laisse inchangée.
      if (editingApiKey && values.apiKeyInput) {
        payload.apiKey = values.apiKeyInput;
      }
      const saved = await updateSyndicGatewaySettings(tenantId, syndicId, payload);
      setSettings(saved);
      setTestResult(null);
      setEditingApiKey(!saved.apiKeyConfigured);
      form.setFieldsValue(toFormValues(saved));
      onSettingsLoaded?.(saved);
      message.success(t('Paramètres du paiement en ligne enregistrés'));
    } catch (e) {
      // GATEWAY_CHECKOUTS_PENDING (409) : des paiements sont en cours, le serveur refuse de changer de compte.
      setSaveError({ code: apiErrorCode(e), message: apiErrorMessage(e, t('Erreur lors de la sauvegarde')) });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testSyndicGatewayConnection(tenantId, syndicId);
      setTestResult(result);
      if (result.ok) message.success(t('Connexion réussie'));
      else message.error(result.message || t('La connexion a échoué'));
      const fresh = await getSyndicGatewaySettings(tenantId, syndicId).catch(() => null);
      if (fresh) setSettings(courant => (courant ? { ...courant, lastTest: fresh.lastTest } : fresh));
    } catch (e) {
      const msg = apiErrorMessage(e, t('Erreur lors du test de connexion'));
      setTestResult({ ok: false, message: msg, balance: null });
      message.error(msg);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Card title={t('Compte de paiement de la copropriété')}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (loadError && !settings) {
    return (
      <Card title={t('Compte de paiement de la copropriété')}>
        <Alert
          type="error"
          showIcon
          message={t('Erreur')}
          description={loadError}
          action={
            <Button size="small" onClick={() => void load()}>
              {t('Réessayer')}
            </Button>
          }
        />
      </Card>
    );
  }

  if (!settings) return null;

  const placeholderCle = settings.apiKeyConfigured
    ? t('•••• {{last4}}', { last4: settings.apiKeyLast4 ?? '????' })
    : t('Aucune clé enregistrée');

  const balanceText = (() => {
    if (balanceLoading && !providerBalance) return t('Chargement…');
    if (!providerBalance) return '—';
    if (providerBalance.balance) {
      return formatMoney(providerBalance.balance.amount, {
        currency: displayCurrency(providerBalance.balance.currency)
      });
    }
    return providerBalance.message || t('Indisponible');
  })();

  return (
    <Card
      title={t('Compte de paiement de la copropriété')}
      extra={
        settings.usable ? (
          <Tag color="success">{t('Paiement en ligne actif')}</Tag>
        ) : (
          <Tag>{t('Paiement en ligne non utilisable')}</Tag>
        )
      }
    >
      <Paragraph type="secondary">
        {t(
          'Chaque copropriété encaisse sur son propre compte marchand PaySecureHub. Sans configuration active et complète, les copropriétaires ne voient pas le bouton « Payer », même si l’agence a son propre compte.'
        )}
      </Paragraph>

      {!settings.encryptionAvailable ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t("Aucune clé de chiffrement n'est configurée côté serveur")}
          description={t("Il n'est pas possible d'enregistrer une clé API tant que ce réglage n'est pas fait.")}
        />
      ) : null}

      {!settings.simulatorAvailable ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t("Le mode simulateur n'est pas disponible sur cet environnement")}
        />
      ) : null}

      {saveError ? (
        <Alert
          type={saveError.code === 'GATEWAY_CHECKOUTS_PENDING' ? 'warning' : 'error'}
          showIcon
          closable
          onClose={() => setSaveError(null)}
          style={{ marginBottom: 16 }}
          message={
            saveError.code === 'GATEWAY_CHECKOUTS_PENDING'
              ? t(
                  'Des paiements sont en cours : le mode, l’identifiant marchand et la clé ne peuvent pas changer pour l’instant.'
                )
              : t('Enregistrement impossible')
          }
          description={saveError.message}
        />
      ) : null}

      <Form
        form={form}
        layout="vertical"
        disabled={!canEditSettings}
        onFinish={handleSubmit}
        onFinishFailed={onAntFormValidationFailed(form)}
      >
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item label={t('Mode')} name="mode" rules={[{ required: true, message: t('Le mode est requis') }]}>
              <Radio.Group>
                <Radio.Button value="SIMULATOR" disabled={!settings.simulatorAvailable}>
                  {t('Simulateur')}
                </Radio.Button>
                <Radio.Button value="LIVE">{t('Réel')}</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label={t('Activer le paiement en ligne')} name="isActive" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label={t('Identifiant marchand')}
              name="merchantId"
              rules={[{ required: mode === 'LIVE', message: t("L'identifiant marchand est requis en mode réel") }]}
            >
              <Input placeholder={t('Identifiant marchand PaySecureHub')} maxLength={120} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label={t('Clé API')} required={mode === 'LIVE'}>
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item name="apiKeyInput" noStyle>
                  <Input.Password
                    disabled={!editingApiKey || !settings.encryptionAvailable}
                    placeholder={placeholderCle}
                    autoComplete="new-password"
                    maxLength={500}
                    iconRender={visible => (visible ? <CheckCircleOutlined /> : <KeyOutlined />)}
                  />
                </Form.Item>
                {canEditSettings && settings.apiKeyConfigured && !editingApiKey ? (
                  <Button
                    disabled={!settings.encryptionAvailable}
                    onClick={() => {
                      setEditingApiKey(true);
                      form.setFieldValue('apiKeyInput', '');
                    }}
                  >
                    {t('Remplacer la clé')}
                  </Button>
                ) : null}
              </Space.Compact>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t("La clé enregistrée n'est jamais réaffichée. Laisser ce champ inactif la conserve inchangée.")}
              </Text>
            </Form.Item>
          </Col>
        </Row>

        {canEditSettings ? (
          <Space wrap>
            <Button type="primary" htmlType="submit" loading={saving}>
              {t('Enregistrer')}
            </Button>
            <Button icon={<ReloadOutlined aria-hidden />} onClick={() => void handleTest()} loading={testing}>
              {t('Tester la connexion')}
            </Button>
          </Space>
        ) : null}
      </Form>

      {testResult ? (
        <Alert
          style={{ marginTop: 16 }}
          type={testResult.ok ? 'success' : 'error'}
          showIcon
          icon={testResult.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
          message={testResult.message}
          description={
            testResult.balance ? (
              <Text>
                {t('Solde : {{amount}}', {
                  amount: formatMoney(testResult.balance.amount, {
                    currency: displayCurrency(testResult.balance.currency)
                  })
                })}
              </Text>
            ) : null
          }
        />
      ) : null}

      <Descriptions column={1} size="small" style={{ marginTop: 16 }} bordered>
        <Descriptions.Item label={t('Adresse de notification (IPN)')}>
          <Text copyable={{ text: settings.callbackUrl }} style={{ wordBreak: 'break-all' }}>
            {settings.callbackUrl}
          </Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('À communiquer à PaySecureHub pour ce compte marchand.')}
          </Text>
        </Descriptions.Item>
        <Descriptions.Item label={t('Frais du fournisseur')}>
          {settings.agencyFeesPaidBy === 'CLIENT'
            ? t('À la charge du payeur (réglage de l’agence)')
            : t('À la charge de l’agence (réglage de l’agence)')}
        </Descriptions.Item>
        <Descriptions.Item label={t('Solde comptable du compte 5525')}>
          {settings.collectionAccount.exists
            ? formatMoney(settings.collectionAccount.balance)
            : t('Compte créé au premier encaissement')}
        </Descriptions.Item>
        <Descriptions.Item label={t('Solde chez le fournisseur')}>
          <Space>
            <Text>{balanceText}</Text>
            <Button
              size="small"
              type="link"
              icon={<ReloadOutlined aria-hidden />}
              loading={balanceLoading}
              onClick={() => void loadProviderBalance()}
            >
              {t('Actualiser')}
            </Button>
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label={t('Dernier test')}>
          {settings.lastTest ? (
            <Space wrap>
              <Tag color={settings.lastTest.ok ? 'success' : 'error'}>
                {settings.lastTest.ok ? t('Réussi') : t('Échoué')}
              </Tag>
              <Text type="secondary">{formatDateTime(settings.lastTest.at)}</Text>
              <Text>{settings.lastTest.message}</Text>
            </Space>
          ) : (
            <Text type="secondary">{t('Aucun test effectué')}</Text>
          )}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
};

export default GatewayConfigCard;
