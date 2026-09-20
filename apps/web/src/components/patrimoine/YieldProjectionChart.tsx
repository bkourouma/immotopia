import React, { useMemo } from 'react';
import { Card } from 'antd';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { YieldProjectionPoint } from '../../types/patrimoine-types';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
interface Props {
  data: YieldProjectionPoint[];
}

export const YieldProjectionChart: React.FC<Props> = ({ data }) => {
  // recharts types a tooltip/axis value as ValueType, which also covers arrays
  // of values; accept that shape and reduce it to a single number.
  const formatNumber = (value: unknown): string => {
    const raw = Array.isArray(value) ? value[0] : value;
    return Number(raw ?? 0).toLocaleString(activeLocale());
  };

  const yAxisWidth = useMemo(() => {
    const dataKeys: Array<keyof YieldProjectionPoint> = [
      'estimatedValue',
      'cumulativeRent',
      'cumulativeExpenses',
      'netResult'
    ];

    const maxAbsValue = data.reduce((currentMax, point) => {
      const maxPointValue = dataKeys.reduce((pointMax, key) => {
        const numericValue = Number(point[key] ?? 0);
        return Math.max(pointMax, Math.abs(numericValue));
      }, 0);
      return Math.max(currentMax, maxPointValue);
    }, 0);

    const labelsToMeasure = [
      formatNumber(0),
      formatNumber(maxAbsValue),
      formatNumber(maxAbsValue * 1.1),
      formatNumber(-maxAbsValue),
      formatNumber(-maxAbsValue * 1.1)
    ];

    const maxLabelLength = labelsToMeasure.reduce((max, label) => Math.max(max, label.length), 0);
    return Math.max(90, maxLabelLength * 9 + 24);
  }, [data]);

  return (
    <Card title={t('Projection de rendement')}>
      <div style={{ width: '100%', height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 20, left: 12, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis width={yAxisWidth} tickMargin={8} tickFormatter={formatNumber} />
            <Tooltip formatter={formatNumber} />
            <Legend />
            <Line type="monotone" dataKey="estimatedValue" name="Valeur estimée" stroke="#1677ff" strokeWidth={2} />
            <Line type="monotone" dataKey="cumulativeRent" name="Loyers cumulés" stroke="#52c41a" strokeWidth={2} />
            <Line
              type="monotone"
              dataKey="cumulativeExpenses"
              name="Charges cumulées"
              stroke="#fa8c16"
              strokeWidth={2}
            />
            <Line type="monotone" dataKey="netResult" name="Résultat net" stroke="#722ed1" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
