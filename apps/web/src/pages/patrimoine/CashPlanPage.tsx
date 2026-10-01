import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, App, InputNumber, Segmented, Select, Skeleton, Space, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCashPlan, updateCashPlanSettings } from '../../services/cash-plan-service';
import { listProperties } from '../../services/property-service';
import { useAuth } from '../../hooks/useAuth';
import { entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, formatMoney } from '../../components/primitives';
import { CashPlanChart } from '../../components/patrimoine/cash-plan/CashPlanChart';
import { CashPlanTable } from '../../components/patrimoine/cash-plan/CashPlanTable';
import { CashPlanSourcesCard } from '../../components/patrimoine/cash-plan/CashPlanSourcesCard';
import { formatPlanMonth, warningLabel } from '../../components/patrimoine/cash-plan/cash-plan-labels';
import { apiErrorMessage } from '../../components/patrimoine/patrimoine-labels';
import type { CashPlanData } from '../../types/cash-plan-types';
import { t } from '../../i18n/t';

const { Text } = Typography;
const ENTITY = 'cash-plan';

function ShortfallBanner({ plan }: { plan: CashPlanData }) {
  const shortfall = plan.shortfall;
  if (!shortfall) {
    return (
      <Alert
        type="success"
        showIcon
        message={t('Aucun creux de trésorerie prévu sur la période.')}
        description={t('Le cumul reste positif ou nul sur {{mois}} mois.', { mois: plan.months })}
      />
    );
  }
  return (
    <Alert
      type="error"
      showIcon
      role="alert"
      message={t('Creux de trésorerie prévu dès {{mois}}', { mois: formatPlanMonth(shortfall.firstMonth, true) })}
      description={t(
        'Le cumul passe à {{solde}} {{devise}} ; le point le plus bas est atteint en {{plusBas}}, avec un déficit de {{profondeur}} {{devise}}.',
        {
          solde: formatMoney(shortfall.firstMonthBalance, { currency: null }),
          plusBas: formatPlanMonth(shortfall.deepestMonth, true),
          profondeur: formatMoney(shortfall.depth, { currency: null }),
          devise: plan.currency
        }
      )}
    />
  );
}

export const CashPlanPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenantMembership } = useAuth();
  const agence = tenantId || tenantMembership?.tenantId;
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const [months, setMonths] = useState<12 | 24>(12);
  const [balanceInput, setBalanceInput] = useState<number | null>(null);
  const [openingBalance, setOpeningBalance] = useState<number | undefined>(undefined);
  const [propertyId, setPropertyId] = useState<string | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | null>(null);

  const filters = { months, openingBalance, propertyId };
  const planQuery = useQuery({
    queryKey: queryKey(ENTITY, agence, filters),
    queryFn: () => getCashPlan(agence as string, { months, openingBalance, propertyId }),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list
  });

  const propertiesQuery = useQuery({
    queryKey: queryKey('properties-options', agence, { limit: 100 }),
    queryFn: () => listProperties(agence as string, { page: 1, limit: 100 }),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.reference
  });
  const propertyOptions = (propertiesQuery.data?.properties ?? []).map(property => ({
    value: property.id,
    label: property.title
  }));

  const saveSettings = useMutation({
    mutationFn: (values: { month: number | null; day: number | null }) =>
      updateCashPlanSettings(agence as string, { propertyTaxDueMonth: values.month, propertyTaxDueDay: values.day }),
    onSuccess: async () => {
      setSaveError(null);
      message.success(t("Date d'exigibilité enregistrée"));
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix(ENTITY, agence) });
    },
    onError: error => setSaveError(apiErrorMessage(error, t("Impossible d'enregistrer la date d'exigibilité.")))
  });

  if (!agence) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const plan = planQuery.data;
  const applyBalance = () => setOpeningBalance(balanceInput === null ? undefined : balanceInput);

  return (
    <>
      <PageHeader
        title={t('Trésorerie prévisionnelle')}
        subtitle={t('Entrées et sorties attendues sur les prochains mois')}
      />

      <Space wrap align="end" size="large" style={{ marginBottom: 16 }}>
        <div>
          <div id="cash-plan-horizon-label">{t('Horizon')}</div>
          <Segmented<12 | 24>
            aria-labelledby="cash-plan-horizon-label"
            value={months}
            onChange={value => setMonths(value)}
            options={[
              { value: 12, label: t('12 mois') },
              { value: 24, label: t('24 mois') }
            ]}
          />
        </div>
        <div>
          <label htmlFor="cash-plan-opening-balance" style={{ display: 'block' }}>
            {t('Solde de départ (XOF)')}
          </label>
          <InputNumber
            id="cash-plan-opening-balance"
            style={{ width: 200 }}
            precision={0}
            value={balanceInput}
            placeholder={t('Non renseigné')}
            onChange={value => setBalanceInput(typeof value === 'number' ? value : null)}
            onBlur={applyBalance}
            onPressEnter={applyBalance}
          />
        </div>
        <div>
          <label htmlFor="cash-plan-property" style={{ display: 'block' }}>
            {t('Bien')}
          </label>
          <Select
            id="cash-plan-property"
            showSearch
            optionFilterProp="label"
            allowClear
            style={{ minWidth: 240 }}
            placeholder={t('Tous les biens')}
            value={propertyId}
            onChange={value => setPropertyId(value)}
            options={propertyOptions}
          />
        </div>
      </Space>

      {planQuery.isPending ? (
        <Skeleton active paragraph={{ rows: 8 }} aria-label={t('Chargement du plan de trésorerie')} />
      ) : planQuery.error || !plan ? (
        <StateBlock
          variant="error"
          title={t('Impossible de charger le plan de trésorerie.')}
          actions={[{ label: t('Réessayer'), onClick: () => planQuery.refetch(), primary: true }]}
        />
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {!plan.openingBalanceProvided ? (
            <Alert
              type="info"
              showIcon
              message={t('Calculé sans solde de départ')}
              description={t(
                'Le cumul part de zéro : renseignez votre solde de trésorerie actuel pour obtenir un cumul réel.'
              )}
            />
          ) : null}
          {plan.warnings.map(warning => (
            <Alert key={warning.code} type="warning" showIcon message={warningLabel(warning.code, warning.count)} />
          ))}

          <ShortfallBanner plan={plan} />
          <Text type="secondary">
            {t(
              'Estimation indicative : le plan repose sur les échéances, emprunts, travaux, dépenses périodiques et taxes connus, sans garantie de réalisation.'
            )}
          </Text>

          {plan.scope.propertyCount === 0 ? (
            <StateBlock
              variant="empty"
              title={t('Aucun bien dans le périmètre du plan')}
              description={t("Aucun bien de l'agence ne peut entrer dans le plan avec ces filtres.")}
            />
          ) : (
            <>
              <CashPlanChart plan={plan} />
              <CashPlanTable periods={plan.periods} />
            </>
          )}

          <CashPlanSourcesCard
            plan={plan}
            saving={saveSettings.isPending}
            saveError={saveError}
            onSaveTaxDate={(month, day) => saveSettings.mutate({ month, day })}
          />
        </Space>
      )}
    </>
  );
};

export default CashPlanPage;
