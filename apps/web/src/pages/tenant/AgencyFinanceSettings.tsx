import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
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
import dayjs, { Dayjs } from 'dayjs';
import {
  AgencyFinanceSettings as Settings,
  AgencyFinanceSettingsInput,
  getAgencyFinanceSettings,
  updateAgencyFinanceSettings
} from '../../services/agency-finance-settings-service';
import { formatMoney } from '../../components/primitives';
import { onAntFormValidationFailed } from '../../lib/antFormFailure';
import { FeeTermsFields } from '../../components/settings/FeeTermsFields';
import { useOwnAssetsOnly } from '../../hooks/useMenuAccess';
import { OwnerFeeTermsCard } from '../../components/settings/OwnerFeeTermsCard';
import { AgentCommissionCard } from '../../components/settings/AgentCommissionCard';
import { useAgencyFeatures } from '../../hooks/useAgencyFeatures';
import { PaymentGatewaySettingsCard } from '../../components/settings/PaymentGatewaySettingsCard';
import { t } from '../../i18n/t';

const { Title, Text, Paragraph } = Typography;

/** Loyer servant d'exemple au calcul affiché sous les honoraires. */
const EXAMPLE_RENT = 200_000;

const ACCOUNT_PATTERN = /^\d{2,12}$/;

/**
 * Valeurs du formulaire : identiques au DTO, sauf `withholdingStartsOn` que
 * le `DatePicker` manipule en `Dayjs` — converti en chaîne `AAAA-MM-JJ` à
 * l'envoi, et l'inverse au chargement.
 */
type FormValues = Omit<AgencyFinanceSettingsInput, 'withholdingStartsOn'> & { withholdingStartsOn: Dayjs | null };

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
  const [form] = Form.useForm<FormValues>();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sections de gestion locative : masquées quand l'abonnement ne comprend pas RENTAL.
  const features = useAgencyFeatures(tenantId);
  // Pack Patrimoine seul : ni honoraires par propriétaire ni commissions de négociateurs.
  const ownAssetsOnly = useOwnAssetsOnly(tenantId, true);
  const rental = features.has('RENTAL');

  // Construite au rendu, pas au chargement du module : `t()` doit lire la
  // langue choisie par l'utilisateur.
  const ACCOUNT_RULE = {
    pattern: ACCOUNT_PATTERN,
    message: t('Un numéro de compte ne contient que des chiffres (2 à 12)')
  };

  const vatRegistered = Form.useWatch('vatRegistered', form);
  const vatRate = Form.useWatch('vatRate', form);
  const feeMode = Form.useWatch('managementFeeMode', form);
  const feeRate = Form.useWatch('managementFeeRate', form);
  const feeFixedAmount = Form.useWatch('managementFeeFixedAmount', form);
  const penaltyBeneficiary = Form.useWatch('penaltyBeneficiary', form);
  const withholdingEnabled = Form.useWatch('withholdingEnabled', form);

  /** `withholdingStartsOn` voyage en `AAAA-MM-JJ` côté API, en `Dayjs` dans le `DatePicker`. */
  const toFormValues = (data: Settings): FormValues => ({
    ...data,
    withholdingStartsOn: data.withholdingStartsOn ? dayjs(data.withholdingStartsOn) : null
  });

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAgencyFinanceSettings(tenantId);
      setSettings(data);
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
  }, [tenantId]);

  const handleSubmit = async (values: FormValues) => {
    if (!tenantId) return;
    setSaving(true);
    try {
      // Les champs de gestion locative masqués ne sont pas dans `values` : on
      // repart des valeurs chargées pour ne pas les remettre à zéro (PUT complet).
      const merged = { ...(settings ? toFormValues(settings) : {}), ...values } as FormValues;
      const saved = await updateAgencyFinanceSettings(tenantId, {
        ...merged,
        managementFeeRate: merged.managementFeeRate ?? null,
        managementFeeFixedAmount: merged.managementFeeFixedAmount ?? null,
        vatRate: merged.vatRate ?? 0,
        withholdingStartsOn: merged.withholdingStartsOn ? merged.withholdingStartsOn.format('YYYY-MM-DD') : null
      });
      setSettings(saved);
      form.setFieldsValue(toFormValues(saved));
      message.success(t('Paramètres financiers enregistrés'));
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.response?.data?.error || t('Erreur lors de la sauvegarde'));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !features.ready) {
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

  // Exemple chiffré : ce que le propriétaire toucherait sur une échéance de
  // loyer entièrement encaissée. En mode forfait, les honoraires valent le
  // forfait dans ce cas — ils ne seraient réduits qu'au prorata d'une
  // échéance partiellement payée, ce que cet exemple ne représente pas.
  const isFixedFeeMode = feeMode === 'FIXED';
  const exampleFee = isFixedFeeMode
    ? typeof feeFixedAmount === 'number' && feeFixedAmount > 0
      ? feeFixedAmount
      : null
    : typeof feeRate === 'number'
      ? Math.round((EXAMPLE_RENT * feeRate) / 100)
      : null;
  const exampleVat =
    exampleFee !== null && vatRegistered && typeof vatRate === 'number' ? Math.round((exampleFee * vatRate) / 100) : 0;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={2} style={{ margin: 0 }}>
          {t('Paramètres financiers')}
        </Title>
        <Text type="secondary">
          {rental
            ? t('Fiscalité, honoraires de gestion et comptes comptables utilisés par les relevés de gérance.')
            : t('Fiscalité et comptes comptables de la caisse.')}
        </Text>
      </div>

      {settings?.isDefault && rental ? (
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

        {rental ? (
          <Card title={t('Honoraires de gestion')} style={{ marginBottom: 16 }}>
            <FeeTermsFields />
            {exampleFee !== null ? (
              <Alert
                type="info"
                showIcon
                message={
                  isFixedFeeMode
                    ? t('Exemple sur une échéance de loyer de {{amount}}, entièrement payée', {
                        amount: formatMoney(EXAMPLE_RENT)
                      })
                    : t('Exemple sur un loyer encaissé de {{amount}}', {
                        amount: formatMoney(EXAMPLE_RENT)
                      })
                }
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
        ) : null}

        <Card
          title={rental ? t('Comptes comptables de la gestion locative') : t('Comptes comptables de la caisse')}
          style={{ marginBottom: 16 }}
        >
          {rental ? (
            <Paragraph type="secondary">
              {t(
                'Numérotation SYSCOHADA. À faire valider par votre comptable : ces comptes recevront les écritures du compte propriétaire.'
              )}
            </Paragraph>
          ) : null}
          <Row gutter={16}>
            {rental ? (
              <>
                <Col xs={24} md={8}>
                  <Form.Item
                    label={t('Fonds des propriétaires')}
                    name="ownerFundsAccountNumber"
                    rules={[ACCOUNT_RULE]}
                    extra={t('Compte de tiers « Mandants », avec un auxiliaire par propriétaire. Défaut : 4731.')}
                  >
                    <Input inputMode="numeric" placeholder={t('À fixer avec votre comptable')} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    label={t('Honoraires de gestion')}
                    name="managementFeeAccountNumber"
                    rules={[ACCOUNT_RULE]}
                    extra={t('Compte de produit « Honoraires de gestion locative ». Défaut : 70611.')}
                  >
                    <Input inputMode="numeric" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item label={t('TVA collectée')} name="vatCollectedAccountNumber" rules={[ACCOUNT_RULE]}>
                    <Input inputMode="numeric" />
                  </Form.Item>
                </Col>
              </>
            ) : null}
            <Col xs={24} md={8}>
              <Form.Item
                label={t('Écart de caisse — manquant')}
                name="cashShortageAccountNumber"
                rules={[ACCOUNT_RULE]}
                extra={t('Compte de charge débité quand une session de caisse révèle un manquant, après enquête.')}
              >
                <Input inputMode="numeric" placeholder="6588" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                label={t('Écart de caisse — excédent')}
                name="cashSurplusAccountNumber"
                rules={[ACCOUNT_RULE]}
                extra={t('Compte de produit crédité quand une session de caisse révèle un excédent, après enquête.')}
              >
                <Input inputMode="numeric" placeholder="7588" />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {rental ? (
          <>
            <Card title={t('Pénalités de retard')} style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    label={t('Bénéficiaire des pénalités')}
                    name="penaltyBeneficiary"
                    rules={[{ required: true, message: t('Le bénéficiaire des pénalités est requis') }]}
                  >
                    <Radio.Group>
                      <Radio.Button value="OWNER">{t('Le propriétaire')}</Radio.Button>
                      <Radio.Button value="AGENCY">{t("L'agence")}</Radio.Button>
                    </Radio.Group>
                  </Form.Item>
                </Col>
                {penaltyBeneficiary === 'AGENCY' ? (
                  <Col xs={24} md={12}>
                    <Form.Item
                      label={t('Compte de produit des pénalités')}
                      name="penaltyIncomeAccountNumber"
                      rules={[
                        ACCOUNT_RULE,
                        { required: true, message: t('Le compte de produit des pénalités est requis') }
                      ]}
                    >
                      <Input inputMode="numeric" />
                    </Form.Item>
                  </Col>
                ) : null}
              </Row>
            </Card>

            <Card title={t('Retenue à la source sur loyers')} style={{ marginBottom: 16 }}>
              <Form.Item
                label={t('Appliquer une retenue à la source sur les loyers')}
                name="withholdingEnabled"
                valuePropName="checked"
              >
                <Switch
                  onChange={checked => {
                    // Date de départ proposée à aujourd'hui : jamais rétroactive par défaut.
                    if (checked && !form.getFieldValue('withholdingStartsOn')) {
                      form.setFieldValue('withholdingStartsOn', dayjs().startOf('day'));
                    }
                  }}
                />
              </Form.Item>
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message={t(
                  'À activer seulement après confirmation du cabinet : statut fiscal de chaque propriétaire, assiette et échéances'
                )}
              />
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    label={t('Appliquer aux encaissements à partir du')}
                    name="withholdingStartsOn"
                    extra={t("La retenue n'est jamais appliquée aux loyers déjà encaissés avant cette date.")}
                    rules={[
                      {
                        required: !!withholdingEnabled,
                        message: t("Indiquez à partir de quelle date la retenue s'applique")
                      }
                    ]}
                  >
                    <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" disabled={!withholdingEnabled} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label={t('Taux — personne physique (%)')} name="withholdingRateIndividual">
                    <InputNumber min={0} max={100} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label={t('Taux — personne morale (%)')} name="withholdingRateCompany">
                    <InputNumber min={0} max={100} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    label={t('Compte de retenue à la source')}
                    name="withholdingAccountNumber"
                    rules={[ACCOUNT_RULE]}
                  >
                    <Input inputMode="numeric" placeholder="4478" />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </>
        ) : null}

        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} size="large">
          {t('Enregistrer')}
        </Button>
      </Form>

      {/* Cartes indépendantes du formulaire ci-dessus : chacune gère son propre
          formulaire de modale, ce qu'un <form> HTML imbriqué n'autoriserait pas. */}
      {tenantId ? <PaymentGatewaySettingsCard tenantId={tenantId} /> : null}
      {tenantId && rental && !ownAssetsOnly ? <OwnerFeeTermsCard tenantId={tenantId} /> : null}
      {tenantId && rental && !ownAssetsOnly ? <AgentCommissionCard tenantId={tenantId} /> : null}
    </Space>
  );
};
