import React, { useEffect, useMemo, useState } from 'react';
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
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography
} from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, KeyOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  PaymentGatewayMode,
  PaymentGatewaySettings,
  UpdatePaymentGatewaySettings,
  getPaymentGatewaySettings,
  testPaymentGatewayConnection,
  updatePaymentGatewaySettings
} from '../../services/payment-gateway-service';
import { listTreasuryAccounts } from '../../services/treasury-service';
import { formatMoney } from '../../components/primitives';
import { onAntFormValidationFailed } from '../../lib/antFormFailure';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Text, Paragraph } = Typography;

/** Valeurs du formulaire : `PaymentGatewaySettings` moins ce qui n'est pas éditable, plus le champ mot de passe. */
interface FormValues {
  mode: PaymentGatewayMode;
  isActive: boolean;
  merchantId: string | null;
  treasuryAccountId: string | null;
  feesPaidBy: 'CLIENT' | 'AGENCY';
  apiKeyInput: string;
}

export interface PaymentGatewaySettingsCardProps {
  tenantId: string;
}

/**
 * Carte « Paiement en ligne » — Lot 7, agrégateur PaySecureHub (contrat
 * `docs/finance/LOT-7-CONTRAT-PAIEMENT-EN-LIGNE.md` §3.1 et §5).
 *
 * La clé API est en écriture seule : l'API ne la renvoie jamais, seulement
 * `apiKeyConfigured` et ses 4 derniers caractères. Le champ reste désactivé,
 * affichant ce placeholder masqué, tant que « Remplacer la clé » n'a pas été
 * cliqué — évite qu'un simple enregistrement du formulaire n'efface la clé
 * par erreur en envoyant une chaîne vide.
 */
export const PaymentGatewaySettingsCard: React.FC<PaymentGatewaySettingsCardProps> = ({ tenantId }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [settings, setSettings] = useState<PaymentGatewaySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    balance: { amount: number; currency: string; at: string } | null;
  } | null>(null);
  // Faux tant que la clé n'a jamais été enregistrée : le champ est alors
  // directement éditable, il n'y a rien à protéger derrière un placeholder.
  const [editingApiKey, setEditingApiKey] = useState(false);

  const mode = Form.useWatch('mode', form);

  const { data: comptes = [], isPending: comptesEnCours } = useQuery({
    queryKey: queryKey('treasury-accounts', tenantId),
    queryFn: () => listTreasuryAccounts(tenantId),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const optionsComptes = useMemo(
    () =>
      comptes
        .filter(compte => compte.isActive && (compte.kind === 'MOBILE_MONEY' || compte.kind === 'BANK'))
        .map(compte => ({
          value: compte.id,
          label: [compte.label, compte.accountNumber, compte.mmOperator].filter(Boolean).join(' · ')
        })),
    [comptes]
  );

  const toFormValues = (data: PaymentGatewaySettings): FormValues => ({
    mode: data.mode,
    isActive: data.isActive,
    merchantId: data.merchantId,
    treasuryAccountId: data.treasuryAccountId,
    feesPaidBy: data.feesPaidBy,
    apiKeyInput: ''
  });

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getPaymentGatewaySettings(tenantId);
      setSettings(data);
      setTestResult(null);
      setEditingApiKey(!data.apiKeyConfigured);
      form.setFieldsValue(toFormValues(data));
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

  const handleSubmit = async (values: FormValues) => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const payload: UpdatePaymentGatewaySettings = {
        mode: values.mode,
        isActive: values.isActive,
        merchantId: values.merchantId || null,
        treasuryAccountId: values.treasuryAccountId || null,
        feesPaidBy: values.feesPaidBy
      };
      // La clé ne part que si l'utilisateur l'a effectivement saisie : sinon
      // elle reste absente du corps, et le backend la laisse inchangée.
      if (editingApiKey) {
        payload.apiKey = values.apiKeyInput ?? '';
      }
      const saved = await updatePaymentGatewaySettings(tenantId, payload);
      setSettings(saved);
      setTestResult(null);
      setEditingApiKey(!saved.apiKeyConfigured);
      form.setFieldsValue(toFormValues(saved));
      message.success(t('Paramètres du paiement en ligne enregistrés'));
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.response?.data?.error || t('Erreur lors de la sauvegarde'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!tenantId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testPaymentGatewayConnection(tenantId);
      setTestResult({ ok: result.ok, message: result.message, balance: result.balance });
      if (result.ok) {
        message.success(t('Connexion réussie'));
      } else {
        message.error(result.message || t('La connexion a échoué'));
      }
      await load();
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || t('Erreur lors du test de connexion');
      setTestResult({ ok: false, message: msg, balance: null });
      message.error(msg);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Card title={t('Paiement en ligne')}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (error && !settings) {
    return (
      <Card title={t('Paiement en ligne')}>
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

  if (!settings) return null;

  const placeholderCle = settings.apiKeyConfigured
    ? t('•••• {{last4}}', { last4: settings.apiKeyLast4 ?? '????' })
    : t('Aucune clé enregistrée');

  return (
    <Card title={t('Paiement en ligne')} style={{ marginBottom: 16 }}>
      <Paragraph type="secondary">
        {t(
          "Permet au locataire de régler ses échéances depuis son portail, via la page hébergée de l'agrégateur PaySecureHub."
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

      <Form form={form} layout="vertical" onFinish={handleSubmit} onFinishFailed={onAntFormValidationFailed(form)}>
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
              <Input placeholder={t('Identifiant marchand PaySecureHub')} />
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
                    iconRender={visible => (visible ? <CheckCircleOutlined /> : <KeyOutlined />)}
                  />
                </Form.Item>
                {settings.apiKeyConfigured && !editingApiKey ? (
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
          <Col xs={24} md={12}>
            <Form.Item
              label={t('Compte de trésorerie')}
              name="treasuryAccountId"
              extra={t(
                'Comptes Mobile Money et banque uniquement. Sans choix, un compte de collecte est créé automatiquement à l’activation.'
              )}
            >
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={t('Compte par défaut')}
                loading={comptesEnCours}
                options={optionsComptes}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label={t('Qui paie les frais de l’agrégateur')}
              name="feesPaidBy"
              rules={[{ required: true, message: t('Ce choix est requis') }]}
            >
              <Radio.Group>
                <Radio.Button value="CLIENT">{t('Le locataire')}</Radio.Button>
                <Radio.Button value="AGENCY">{t("L'agence")}</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </Col>
        </Row>

        <Space wrap>
          <Button type="primary" htmlType="submit" loading={saving}>
            {t('Enregistrer')}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void handleTest()} loading={testing}>
            {t('Tester la connexion')}
          </Button>
        </Space>
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
                  amount: formatMoney(testResult.balance.amount, { currency: testResult.balance.currency })
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
        </Descriptions.Item>
        {settings.treasuryAccountLabel ? (
          <Descriptions.Item label={t('Compte de collecte')}>{settings.treasuryAccountLabel}</Descriptions.Item>
        ) : null}
        <Descriptions.Item label={t('Dernier test')}>
          {settings.lastTest ? (
            <Space>
              <Tag color={settings.lastTest.ok ? 'success' : 'error'}>
                {settings.lastTest.ok ? t('Réussi') : t('Échoué')}
              </Tag>
              <Text type="secondary">{new Date(settings.lastTest.at).toLocaleString(activeLocale())}</Text>
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

export default PaymentGatewaySettingsCard;
