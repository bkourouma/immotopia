import React, { useState } from 'react';
import { Alert, Button, Card, Typography } from 'antd';
import type { AssetDto, DebtDto } from '../../../services/patrimoine-assets-service';
import type { SimulationOperation } from '../../../services/patrimoine-projections-service';
import { apiErrorMessage } from '../actifs/asset-format';
import { t } from '../../../i18n/t';
import { OperationFields } from './OperationForms';
import { SelectField } from './projection-fields';
import {
  MAX_OPERATIONS,
  OPERATION_TYPES,
  buildOperation,
  operationErrors,
  operationFieldLabel,
  operationSummary,
  operationTypeLabel,
  type OperationType,
  type OperationValues
} from './projection-helpers';

const AddForm: React.FC<{
  horizon: number;
  assets: AssetDto[];
  debts: DebtDto[];
  full: boolean;
  onAdd: (operation: SimulationOperation) => void;
}> = ({ horizon, assets, debts, full, onAdd }) => {
  const [type, setType] = useState<OperationType>('SELL_ASSET');
  const [values, setValues] = useState<OperationValues>({});
  const [invalid, setInvalid] = useState(false);
  const set = (key: string) => (value: string) => setValues(current => ({ ...current, [key]: value }));
  const v = (key: string) => values[key] ?? '';
  const submit = () => {
    const operation = buildOperation(type, values);
    if (!operation) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setValues({});
    onAdd(operation);
  };

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        submit();
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
    >
      <SelectField
        id="op-type"
        label={t("Type d'opération")}
        value={type}
        onChange={next => {
          setType(next as OperationType);
          setValues({});
          setInvalid(false);
        }}
        options={OPERATION_TYPES.map(key => ({ value: key, label: operationTypeLabel(key) }))}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <OperationFields type={type} v={v} set={set} horizon={horizon} assets={assets} debts={debts} />
      </div>
      {invalid && (
        <Alert type="error" showIcon title={t('Renseignez les champs obligatoires avec des valeurs valides.')} />
      )}
      <div>
        <Button htmlType="submit" disabled={full}>
          {t("Ajouter l'opération")}
        </Button>
        {full && (
          <Typography.Text type="secondary" style={{ marginInlineStart: 'var(--space-3)' }}>
            {t('Vous avez atteint le maximum de {{max}} opérations.', { max: MAX_OPERATIONS })}
          </Typography.Text>
        )}
      </div>
    </form>
  );
};

/**
 * Panneau « Simuler » : opérations hypothétiques ajoutables une à une, puis
 * lancées en une fois. Une simulation ne modifie jamais les données réelles.
 */
export const SimulationPanel: React.FC<{
  horizon: number;
  operations: SimulationOperation[];
  assets: AssetDto[];
  debts: DebtDto[];
  onChange: (operations: SimulationOperation[]) => void;
  onRun: () => void;
  running: boolean;
  outdated: boolean;
  canRun: boolean;
  error: unknown;
}> = ({ horizon, operations, assets, debts, onChange, onRun, running, outdated, canRun, error }) => {
  const errors = error ? operationErrors(error) : null;
  const assetName = (id: string) => assets.find(a => a.id === id)?.name ?? t('Actif');
  const loanName = (id: string) => debts.find(d => d.id === id)?.lender ?? t('Dette');
  return (
    <Card title={t('Simuler')}>
      <Typography.Paragraph type="secondary">{t('Une simulation ne modifie pas vos données.')}</Typography.Paragraph>
      <AddForm
        horizon={horizon}
        assets={assets}
        debts={debts}
        full={operations.length >= MAX_OPERATIONS}
        onAdd={operation => onChange([...operations, operation])}
      />
      <Typography.Title level={5} style={{ marginTop: 'var(--space-4)' }}>
        {t('Opérations simulées ({{count}})', { count: operations.length })}
      </Typography.Title>
      {operations.length === 0 ? (
        <Typography.Paragraph type="secondary">
          {t('Aucune opération : ajoutez-en une ci-dessus.')}
        </Typography.Paragraph>
      ) : (
        <ol style={{ paddingInlineStart: 20 }}>
          {operations.map((operation, index) => (
            <li key={index} style={{ marginBottom: 'var(--space-2)' }}>
              <span>{operationSummary(operation, { asset: assetName, loan: loanName })}</span>{' '}
              <Button size="small" type="link" onClick={() => onChange(operations.filter((_, i) => i !== index))}>
                {t('Retirer')}
              </Button>
              {errors?.byIndex.get(index)?.map(entry => (
                <div
                  key={`${entry.field}-${entry.message}`}
                  role="alert"
                  style={{ color: 'var(--color-error, #cf1322)' }}
                >
                  {t('Opération {{n}}', { n: index + 1 })} — {operationFieldLabel(entry.field)} : {entry.message}
                </div>
              ))}
            </li>
          ))}
        </ol>
      )}
      {errors && errors.byIndex.size === 0 && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 'var(--space-3)' }}
          title={errors.general[0] ?? apiErrorMessage(error, t('Impossible de lancer la simulation.'))}
        />
      )}
      {outdated && (
        <Typography.Paragraph type="secondary">
          {t('Les opérations ont changé : relancez la simulation pour mettre à jour les résultats.')}
        </Typography.Paragraph>
      )}
      <Button type="primary" onClick={onRun} loading={running} disabled={!canRun}>
        {t('Lancer la simulation')}
      </Button>
    </Card>
  );
};
