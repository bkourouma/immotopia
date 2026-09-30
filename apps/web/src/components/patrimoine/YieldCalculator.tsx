import React from 'react';
import { Alert, Button, Card, Col, Form, InputNumber, Row, Space, Statistic, Typography } from 'antd';
import type { PropertyYieldData } from '../../types/patrimoine-types';
import { t } from '../../i18n/t';
import { formatMoney } from '../primitives';
import { DEVISE_PATRIMOINE } from './patrimoine-labels';
import { formatYieldPercent } from './patrimoine-format';

export interface YieldAssumptionsInput {
  years: number;
  valueGrowthRate: number;
  rentGrowthRate: number;
  expenseGrowthRate: number;
  vacancyRate: number;
}

interface Props {
  data?: PropertyYieldData | null;
  loading?: boolean;
  assumptions?: YieldAssumptionsInput;
  onRecalculate?: (assumptions: YieldAssumptionsInput) => void;
}

const defaultAssumptions: YieldAssumptionsInput = {
  years: 10,
  valueGrowthRate: 0.03,
  rentGrowthRate: 0.02,
  expenseGrowthRate: 0.025,
  vacancyRate: 0.05
};

/**
 * Indicateur qui dépend du prix d'acquisition (net-net, plus-value latente).
 *
 * `null` veut dire « prix d'acquisition inconnu » : afficher 0 aurait inventé
 * un rendement nul. On écrit « — » et on dit quoi renseigner.
 */
const IndicateurAcquisition: React.FC<{
  title: string;
  value: number | null | undefined;
  kind: 'percent' | 'money';
  hasData: boolean;
  loading?: boolean;
}> = ({ title, value, kind, hasData, loading }) => {
  if (value === null || value === undefined) {
    return (
      <>
        <Statistic title={title} value="—" loading={loading} />
        {hasData && value === null && !loading ? (
          <Typography.Text type="secondary">
            {t("Renseignez le prix d'acquisition dans une valorisation")}
          </Typography.Text>
        ) : null}
      </>
    );
  }
  if (kind === 'money') {
    return <Statistic title={title} value={formatMoney(value, { currency: DEVISE_PATRIMOINE })} loading={loading} />;
  }
  return <Statistic title={title} value={formatYieldPercent(value)} loading={loading} />;
};

export const YieldCalculator: React.FC<Props> = ({ data, loading, assumptions, onRecalculate }) => {
  const [form] = Form.useForm<YieldAssumptionsInput>();

  React.useEffect(() => {
    form.setFieldsValue(assumptions || defaultAssumptions);
  }, [assumptions, form]);

  // Valeur à l'horizon, sinon valeur actuelle. `null` (prix d'acquisition
  // inconnu) se propage tel quel : ce n'est pas une absence de projection.
  const projected = (key: 'netNetYield' | 'latentCapitalGain'): number | null | undefined => {
    const horizon = data?.projectedAtHorizon;
    if (horizon && horizon[key] !== undefined) return horizon[key];
    return data?.[key];
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card title={t('Rendement')}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={6}>
            <Statistic title={t('Brut')} value={formatYieldPercent(data?.grossYield ?? 0)} loading={loading} />
          </Col>
          <Col xs={24} md={6}>
            <Statistic title={t('Net')} value={formatYieldPercent(data?.netYield ?? 0)} loading={loading} />
          </Col>
          <Col xs={24} md={6}>
            <IndicateurAcquisition
              title={t('Net-Net')}
              value={data ? data.netNetYield : undefined}
              kind="percent"
              hasData={Boolean(data)}
              loading={loading}
            />
          </Col>
          <Col xs={24} md={6}>
            <IndicateurAcquisition
              title={t('Plus-value latente')}
              value={data ? data.latentCapitalGain : undefined}
              kind="money"
              hasData={Boolean(data)}
              loading={loading}
            />
          </Col>
        </Row>
      </Card>

      <Card
        title={t('Rendement projeté ({{value}} ans)', {
          value: data?.projectedAtHorizon?.year ?? assumptions?.years ?? defaultAssumptions.years
        })}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} md={6}>
            <Statistic
              title={t('Brut projeté')}
              value={formatYieldPercent(data?.projectedAtHorizon?.grossYield ?? data?.grossYield ?? 0)}
              loading={loading}
            />
          </Col>
          <Col xs={24} md={6}>
            <Statistic
              title={t('Net projeté')}
              value={formatYieldPercent(data?.projectedAtHorizon?.netYield ?? data?.netYield ?? 0)}
              loading={loading}
            />
          </Col>
          <Col xs={24} md={6}>
            <IndicateurAcquisition
              title={t('Net-Net projeté')}
              value={data ? projected('netNetYield') : undefined}
              kind="percent"
              hasData={Boolean(data)}
              loading={loading}
            />
          </Col>
          <Col xs={24} md={6}>
            <IndicateurAcquisition
              title={t('Plus-value latente projetée')}
              value={data ? projected('latentCapitalGain') : undefined}
              kind="money"
              hasData={Boolean(data)}
              loading={loading}
            />
          </Col>
        </Row>
      </Card>

      <Card title={t('Hypothèses de projection')}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t(
            'Hypothèses non enregistrées sur le serveur : elles sont conservées sur cet appareil, pour ce bien.'
          )}
        />
        <Form layout="vertical" form={form} onFinish={values => onRecalculate?.(values)}>
          <Row gutter={[16, 8]}>
            <Col xs={24} md={8}>
              <Form.Item name="years" label={t('Années')}>
                <InputNumber min={1} max={30} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="valueGrowthRate" label={t('Croissance valeur (0.xx)')}>
                <InputNumber min={-0.5} max={1} step={0.005} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="rentGrowthRate" label={t('Croissance loyers (0.xx)')}>
                <InputNumber min={-0.5} max={1} step={0.005} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="expenseGrowthRate" label={t('Croissance charges (0.xx)')}>
                <InputNumber min={-0.5} max={1} step={0.005} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="vacancyRate" label={t('Vacance locative (0.xx)')}>
                <InputNumber min={0} max={1} step={0.005} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" loading={loading} disabled={!onRecalculate}>
            {t('Recalculer')}
          </Button>
        </Form>
      </Card>
    </Space>
  );
};
