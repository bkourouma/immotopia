import React from 'react';
import { Card, Col, Row, Statistic } from 'antd';
import { PatrimoineOverviewData } from '../../types/patrimoine-types';

interface Props {
  data: PatrimoineOverviewData;
}

export const PatrimoineOverview: React.FC<Props> = ({ data }) => {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={8}>
        <Card>
          <Statistic title="Biens" value={data.totalProperties} />
        </Card>
      </Col>
      <Col xs={24} md={8}>
        <Card>
          <Statistic title="Taux occupation" value={data.occupancyRate * 100} precision={2} suffix="%" />
        </Card>
      </Col>
      <Col xs={24} md={8}>
        <Card>
          <Statistic title="Valeur estimee totale" value={data.totalEstimatedValue} suffix="XOF" />
        </Card>
      </Col>
      <Col xs={24} md={8}>
        <Card>
          <Statistic title="Encours credits" value={data.totalLoanBalance} suffix="XOF" />
        </Card>
      </Col>
      <Col xs={24} md={8}>
        <Card>
          <Statistic title="Charges annuelles" value={data.totalExpensesThisYear} suffix="XOF" />
        </Card>
      </Col>
      <Col xs={24} md={8}>
        <Card>
          <Statistic title="Loyers annuels" value={data.totalAnnualRent} suffix="XOF" />
        </Card>
      </Col>
    </Row>
  );
};

