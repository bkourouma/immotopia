import React, { useState } from 'react';
import { Alert, Button, Card, Input, Typography } from 'antd';
import type { AssetDto, DebtDto } from '../../../services/patrimoine-assets-service';
import type { SimulationOperation } from '../../../services/patrimoine-projections-service';
import { assetClassOptions } from '../actifs/asset-classes';
import { apiErrorMessage } from '../actifs/asset-format';
import { t } from '../../../i18n/t';
import { NumField, SelectField } from './projection-fields';
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
  const yearField = (key = 'year', label = t('Année')) => (
    <NumField id={`op-${key}`} label={label} value={v(key)} onChange={set(key)} min={1} max={horizon} step={1} />
  );

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
        {type === 'SELL_ASSET' && (
          <>
            <SelectField
              id="op-assetId"
              label={t('Actif à vendre')}
              value={v('assetId')}
              onChange={set('assetId')}
              placeholder={t('Choisir un actif')}
              options={assets.filter(a => a.status === 'ACTIVE').map(a => ({ value: a.id, label: a.name }))}
            />
            {yearField()}
            <NumField
              id="op-salePrice"
              label={t('Prix de vente (facultatif)')}
              value={v('salePrice')}
              onChange={set('salePrice')}
              min={0}
            />
            <NumField
              id="op-feesPercent"
              label={t('Frais (%)')}
              value={v('feesPercent')}
              onChange={set('feesPercent')}
              min={0}
              max={100}
            />
          </>
        )}
        {type === 'BUY_ASSET' && (
          <>
            <SelectField
              id="op-assetClass"
              label={t('Classe')}
              value={v('assetClass')}
              onChange={set('assetClass')}
              placeholder={t('Choisir une classe')}
              options={assetClassOptions()}
            />
            <div style={{ flex: '1 1 200px', minWidth: 160 }}>
              <label htmlFor="op-name" style={{ display: 'block', marginBottom: 4 }}>
                {t("Nom de l'actif")}
              </label>
              <Input
                id="op-name"
                maxLength={200}
                value={v('name')}
                onChange={event => set('name')(event.target.value)}
              />
            </div>
            <NumField id="op-price" label={t('Prix')} value={v('price')} onChange={set('price')} min={0} />
            {yearField()}
            <NumField
              id="op-growthPercent"
              label={t('Croissance (%) (facultatif)')}
              value={v('growthPercent')}
              onChange={set('growthPercent')}
              min={-50}
              max={100}
            />
          </>
        )}
        {type === 'TAKE_LOAN' && (
          <>
            <NumField
              id="op-amount"
              label={t('Montant emprunté')}
              value={v('amount')}
              onChange={set('amount')}
              min={0}
            />
            <NumField
              id="op-annualRatePercent"
              label={t('Taux annuel (%)')}
              value={v('annualRatePercent')}
              onChange={set('annualRatePercent')}
              min={0}
              max={100}
            />
            <NumField
              id="op-termYears"
              label={t('Durée (années)')}
              value={v('termYears')}
              onChange={set('termYears')}
              min={1}
              max={30}
              step={1}
            />
            {yearField()}
          </>
        )}
        {type === 'PREPAY_LOAN' && (
          <>
            <SelectField
              id="op-loanId"
              label={t('Dette à rembourser')}
              value={v('loanId')}
              onChange={set('loanId')}
              placeholder={t('Choisir une dette')}
              options={debts.filter(d => d.status === 'ACTIVE').map(d => ({ value: d.id, label: d.lender }))}
            />
            <NumField
              id="op-amount"
              label={t('Montant remboursé')}
              value={v('amount')}
              onChange={set('amount')}
              min={0}
            />
            {yearField()}
          </>
        )}
        {type === 'MONTHLY_SAVING' && (
          <>
            <NumField
              id="op-amount"
              label={t('Montant par mois')}
              value={v('amount')}
              onChange={set('amount')}
              min={0}
            />
            {yearField('fromYear', t("De l'année"))}
            {yearField('toYear', t("À l'année (facultatif)"))}
          </>
        )}
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
