import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Space,
  Spin,
  Switch,
  Typography
} from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import {
  AgencyFinanceSettings as Settings,
  AgencyFinanceSettingsInput,
  getAgencyFinanceSettings,
  updateAgencyFinanceSettings
} from '../../services/agency-finance-settings-service';
import { formatMoney } from '../../components/primitives';
import { onAntFormValidationFailed } from '../../lib/antFormFailure';
import { t } from '../../i18n/t';

const { Title, Text, Paragraph } = Typography;

/** Loyer servant d'exemple au calcul affiché sous les honoraires. */
const EXAMPLE_RENT = 200_000;

const ACCOUNT_PATTERN = /^\d{2,12}$/;

/**
 * Paramètres financiers de l'agence : fiscalité, honoraires de gestion et
 * comptes de la gestion locative.
 *
 * Les relevés de gérance les lisent à chaque calcul et en figent une copie :
 * modifier le taux ici ne change pas un relevé déjà produit.
 */
export const AgencyFinanceSettings: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [form] = Form.useForm<AgencyFinanceSettingsInput>();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Construite au rendu, pas au chargement du module : `t()` doit lire la
  // langue choisie par l'utilisateur.
  const ACCOUNT_RULE = {
    pattern: ACCOUNT_PATTERN,
    message: t('Un numéro de compte ne contient que des chiffres (2 à 12)')
  };

  const vatRegistered = Form.useWatch('vatRegistered', form);
  const vatRate = Form.useWatch('vatRate', form);
  const feeRate = Form.useWatch('managementFeeRate', form);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAgencyFinanceSettings(tenantId);
      setSettings(data);
      form.setFieldsValue(data);
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
  }, [tenantId]);

  const handleSubmit = async (values: AgencyFinanceSettingsInput) => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const saved = await updateAgencyFinanceSettings(tenantId, {
        ...values,
        managementFeeRate: values.managementFeeRate ?? null,
        vatRate: values.vatRate ?? 0
      });
      setSettings(saved);
      form.setFieldsValue(saved);
      message.success(t('Paramètres financiers enregistrés'));
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.response?.data?.error || t('Erreur lors de la sauvegarde'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', minHeight: 300, alignItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error && !settings) {
    return (
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
    );
  }

  // Exemple chiffré : ce que le propriétaire toucherait sur un loyer encaissé.
  const exampleFee = typeof feeRate === 'number' ? Math.round((EXAMPLE_RENT * feeRate) / 100) : null;
  const exampleVat =
    exampleFee !== null && vatRegistered && typeof vatRate === 'number' ? Math.round((exampleFee * vatRate) / 100) : 0;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={2} style={{ margin: 0 }}>
          {t('Paramètres financiers')}
        </Title>
        <Text type="secondary">
          {t('Fiscalité, honoraires de gestion et comptes comptables utilisés par les relevés de gérance.')}
        </Text>
      </div>

      {settings?.isDefault ? (
        <Alert
          type="warning"
          showIcon
          message={t("Ces paramètres n'ont jamais été enregistrés")}
          description={t(
            "Les valeurs affichées sont des propositions. Tant que le taux d'honoraires n'est pas fixé, les relevés de gérance ne déduisent aucun honoraire."
          )}
        />
      ) : null}

      <Form form={form} layout="vertical" onFinish={handleSubmit} onFinishFailed={onAntFormValidationFailed(form)}>
        <Card title={t('Fiscalité')} style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label={t("L'agence est assujettie à la TVA")}
                name="vatRegistered"
                valuePropName="checked"
                extra={t("Une agence soumise à l'impôt synthétique ne facture pas la TVA.")}
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={t('Taux de TVA (%)')}
                name="vatRate"
                rules={[{ required: true, message: t('Le taux de TVA est requis') }]}
              >
                <InputNumber min={0} max={100} disabled={!vatRegistered} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={t('Numéro de compte contribuable (NCC)')} name="taxpayerNumber">
                <Input maxLength={30} />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Card title={t('Honoraires de gestion')} style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label={t("Taux d'honoraires (%)")}
                name="managementFeeRate"
                extra={t('Laisser vide tant que le taux n’est pas décidé.')}
              >
                <InputNumber min={0} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={t('Calculés sur')} name="managementFeeBase">
                <Radio.Group>
                  <Space direction="vertical">
                    <Radio value="RENT_ONLY">{t('Le loyer seul, hors charges et pénalités')}</Radio>
                    <Radio value="ALL_COLLECTED">{t('Tout ce qui est encaissé')}</Radio>
                  </Space>
                </Radio.Group>
              </Form.Item>
            </Col>
          </Row>
          {exampleFee !== null ? (
            <Alert
              type="info"
              showIcon
              message={t('Exemple sur un loyer encaissé de {{amount}}', {
                amount: formatMoney(EXAMPLE_RENT)
              })}
              description={
                <Paragraph style={{ margin: 0 }}>
                  {t('Honoraires : {{fee}}', { fee: formatMoney(exampleFee) })}
                  {vatRegistered ? ` · ${t('TVA : {{vat}}', { vat: formatMoney(exampleVat) })}` : ''}
                  {' · '}
                  <strong>
                    {t('Net au propriétaire : {{net}}', { net: formatMoney(EXAMPLE_RENT - exampleFee - exampleVat) })}
                  </strong>
                </Paragraph>
              }
            />
          ) : null}
        </Card>

        <Card title={t('Comptes comptables de la gestion locative')} style={{ marginBottom: 16 }}>
          <Paragraph type="secondary">
            {t(
              'Numérotation SYSCOHADA. À faire valider par votre comptable : ces comptes recevront les écritures du compte propriétaire.'
            )}
          </Paragraph>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item label={t('Fonds des propriétaires')} name="ownerFundsAccountNumber" rules={[ACCOUNT_RULE]}>
                <Input inputMode="numeric" placeholder={t('À fixer avec votre comptable')} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label={t('Honoraires de gestion')} name="managementFeeAccountNumber" rules={[ACCOUNT_RULE]}>
                <Input inputMode="numeric" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label={t('TVA collectée')} name="vatCollectedAccountNumber" rules={[ACCOUNT_RULE]}>
                <Input inputMode="numeric" />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} size="large">
          {t('Enregistrer')}
        </Button>
      </Form>
    </Space>
  );
};
