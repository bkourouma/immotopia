import React from 'react';
import { Card, Col, Row, Statistic } from 'antd';

interface FundItem {
  id: string;
  name: string;
  balance: number | string;
  currency: string;
}

interface SyndicateFundWidgetProps {
  funds: FundItem[];
}

export const SyndicateFundWidget: React.FC<SyndicateFundWidgetProps> = ({ funds }) => {
  return (
    <Row gutter={[16, 16]}>
      {funds.map((fund) => (
        <Col key={fund.id} xs={24} md={12} xl={8}>
          <Card>
            <Statistic
              title={fund.name}
              value={Number(fund.balance)}
              suffix={fund.currency}
              precision={2}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
};
