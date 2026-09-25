import React from 'react';
import { Button, Card, Col, Form, InputNumber, Row, Space, Statistic } from 'antd';
import type { PropertyYieldData } from '../../types/patrimoine-types';
import { t } from '../../i18n/t';

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

export const YieldCalculator: React.FC<Props> = ({ data, loading, assumptions, onRecalculate }) => {
  const [form] = Form.useForm<YieldAssumptionsInput>();

  React.useEffect(() => {
    form.setFieldsValue(assumptions || defaultAssumptions);
  }, [assumptions, form]);

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card title={t('Rendement')}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={6}>
            <Statistic title={t('Brut')} value={data?.grossYield ?? 0} precision={2} suffix="%" loading={loading} />
          </Col>
          <Col xs={24} md={6}>
            <Statistic title={t('Net')} value={data?.netYield ?? 0} precision={2} suffix="%" loading={loading} />
          </Col>
          <Col xs={24} md={6}>
            <Statistic title={t('Net-Net')} value={data?.netNetYield ?? 0} precision={2} suffix="%" loading={loading} />
          </Col>
          <Col xs={24} md={6}>
            <Statistic
              title={t('Plus-value latente')}
              value={data?.latentCapitalGain ?? 0}
              precision={0}
              suffix="FCFA"
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
              value={data?.projectedAtHorizon?.grossYield ?? data?.grossYield ?? 0}
              precision={2}
              suffix="%"
              loading={loading}
            />
          </Col>
          <Col xs={24} md={6}>
            <Statistic
              title={t('Net projeté')}
              value={data?.projectedAtHorizon?.netYield ?? data?.netYield ?? 0}
              precision={2}
              suffix="%"
              loading={loading}
            />
          </Col>
          <Col xs={24} md={6}>
            <Statistic
              title={t('Net-Net projeté')}
              value={data?.projectedAtHorizon?.netNetYield ?? data?.netNetYield ?? 0}
              precision={2}
              suffix="%"
              loading={loading}
            />
          </Col>
          <Col xs={24} md={6}>
            <Statistic
              title={t('Plus-value latente projetée')}
              value={data?.projectedAtHorizon?.latentCapitalGain ?? data?.latentCapitalGain ?? 0}
              precision={0}
              suffix="FCFA"
              loading={loading}
            />
          </Col>
        </Row>
      </Card>

      <Card title={t('Hypothèses de projection')}>
        <Form layout="vertical" form={form} onFinish={values => onRecalculate?.(values)}>
          <Row gutter={[16, 8]}>
            <Col xs={24} md={8}>
              <Form.Item name="years" label={t('Années')}>
                <InputNumber min={1} max={30} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="valueGrowthRate" label={t('Croissance valeur (0.xx)')}>
                <InputNumber min={0} max={1} step={0.005} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="rentGrowthRate" label={t('Croissance loyers (0.xx)')}>
                <InputNumber min={0} max={1} step={0.005} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="expenseGrowthRate" label={t('Croissance charges (0.xx)')}>
                <InputNumber min={0} max={1} step={0.005} style={{ width: '100%' }} />
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
