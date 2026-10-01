import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, InputNumber, Space, Tag, Typography } from 'antd';
import type { CashPlanData } from '../../../types/cash-plan-types';
import { t } from '../../../i18n/t';
import {
  excludedReasonLabel,
  monthName,
  sourceKeyLabel,
  sourceReasonLabel,
  sourceStatusLabel
} from './cash-plan-labels';

const { Text } = Typography;

interface Props {
  plan: CashPlanData;
  saving: boolean;
  saveError: string | null;
  onSaveTaxDate: (month: number | null, day: number | null) => void;
}

function daysIn(month: number): number {
  // Février : jusqu'à 29, comme l'API.
  return month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Date d'exigibilité de la taxe foncière : mois et jour, ou les deux vides pour l'effacer. */
const TaxDueDateForm: React.FC<{
  month: number | null;
  day: number | null;
  saving: boolean;
  error: string | null;
  onSave: (month: number | null, day: number | null) => void;
}> = ({ month, day, saving, error, onSave }) => {
  const [monthValue, setMonthValue] = useState<number | null>(month);
  const [dayValue, setDayValue] = useState<number | null>(day);
  const [invalid, setInvalid] = useState<string | null>(null);

  useEffect(() => {
    setMonthValue(month);
    setDayValue(day);
  }, [month, day]);

  const submit = () => {
    if ((monthValue === null) !== (dayValue === null)) {
      setInvalid(t('Indiquez le mois et le jour, ou videz les deux champs pour effacer la date.'));
      return;
    }
    if (monthValue !== null && dayValue !== null && dayValue > daysIn(monthValue)) {
      setInvalid(t("Ce jour n'existe pas dans ce mois."));
      return;
    }
    setInvalid(null);
    onSave(monthValue, dayValue);
  };

  return (
    <form
      aria-label={t("Date d'exigibilité de la taxe foncière")}
      onSubmit={event => {
        event.preventDefault();
        submit();
      }}
    >
      <Space wrap align="end">
        <div>
          <label htmlFor="cash-plan-tax-month" style={{ display: 'block' }}>
            {t('Mois')}
          </label>
          <select
            id="cash-plan-tax-month"
            className="ant-input"
            style={{ minWidth: 150, height: 32 }}
            value={monthValue ?? ''}
            onChange={event => setMonthValue(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">{t('— Non renseigné —')}</option>
            {Array.from({ length: 12 }, (_, index) => index + 1).map(number => (
              <option key={number} value={number}>
                {monthName(number)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cash-plan-tax-day" style={{ display: 'block' }}>
            {t('Jour')}
          </label>
          <InputNumber
            id="cash-plan-tax-day"
            min={1}
            max={31}
            precision={0}
            value={dayValue}
            onChange={value => setDayValue(typeof value === 'number' ? value : null)}
          />
        </div>
        <Button type="primary" htmlType="submit" loading={saving}>
          {t("Enregistrer la date d'exigibilité")}
        </Button>
      </Space>
      {invalid || error ? (
        <Alert style={{ marginTop: 8 }} type="error" showIcon message={invalid || error} role="alert" />
      ) : null}
    </form>
  );
};

/** Sources absentes ou partielles et leur explication, plus la date d'exigibilité de la taxe. */
export const CashPlanSourcesCard: React.FC<Props> = ({ plan, saving, saveError, onSaveTaxDate }) => {
  const missing = plan.sources.filter(source => source.status !== 'INCLUDED');
  const included = plan.sources.filter(source => source.status === 'INCLUDED');
  const taxNotSet = plan.sources.some(
    source => source.source === 'PROPERTY_TAX' && source.reason === 'TAX_DUE_DATE_NOT_SET'
  );

  return (
    <Card title={t('Sources du plan')}>
      {included.length > 0 ? (
        <p>
          <Text strong>{t('Sources incluses :')}</Text>{' '}
          {included.map(source => (
            <Tag key={source.source} color="green">
              {sourceKeyLabel(source.source)}
            </Tag>
          ))}
        </p>
      ) : null}

      {missing.length > 0 ? (
        <>
          <Text strong>{t('Sources non incluses ou partielles :')}</Text>
          <ul style={{ paddingInlineStart: 20, marginTop: 8 }}>
            {missing.map(source => (
              <li key={source.source}>
                <Text strong>{sourceKeyLabel(source.source)}</Text> <Tag>{sourceStatusLabel(source.status)}</Tag>
                <div>{source.reason ? sourceReasonLabel(source.reason, source.count) : null}</div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Text type="secondary">{t('Toutes les sources sont incluses dans le plan.')}</Text>
      )}

      <div style={{ marginTop: 16 }}>
        <Text strong>{t("Date d'exigibilité de la taxe foncière")}</Text>
        <p style={{ margin: '4px 0 8px' }}>
          <Text type="secondary">
            {taxNotSet
              ? t('Indiquez le mois et le jour où la taxe foncière est due pour l’intégrer au plan.')
              : t('Mois et jour où la taxe foncière est due chaque année.')}
          </Text>
        </p>
        <TaxDueDateForm
          month={plan.settings.propertyTaxDueMonth}
          day={plan.settings.propertyTaxDueDay}
          saving={saving}
          error={saveError}
          onSave={onSaveTaxDate}
        />
      </div>

      {plan.scope.excluded.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <Text strong>{t('Biens exclus du plan :')}</Text>
          <ul style={{ paddingInlineStart: 20, marginTop: 8 }}>
            {plan.scope.excluded.map(property => (
              <li key={property.propertyId}>
                {property.title} <Tag>{excludedReasonLabel(property.reason)}</Tag>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
};
