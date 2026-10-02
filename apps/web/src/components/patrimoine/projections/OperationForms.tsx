import React from 'react';
import { Input } from 'antd';
import type { AssetDto, DebtDto } from '../../../services/patrimoine-assets-service';
import { assetClassOptions } from '../actifs/asset-classes';
import { t } from '../../../i18n/t';
import { NumField, SelectField } from './projection-fields';
import type { OperationType } from './projection-helpers';

/** Champs d'un sous-formulaire : valeurs saisies (en chaînes), setter par clé, horizon pour borner les années. */
interface FormProps {
  v: (key: string) => string;
  set: (key: string) => (value: string) => void;
  horizon: number;
}

const YearField: React.FC<FormProps & { name?: string; label?: string }> = ({
  v,
  set,
  horizon,
  name = 'year',
  label = t('Année')
}) => <NumField id={`op-${name}`} label={label} value={v(name)} onChange={set(name)} min={1} max={horizon} step={1} />;

/** Actifs qu'une vente peut viser : actifs en cours, valorisés, hors compte de trésorerie (`CASH`). */
export function sellableAssets(assets: AssetDto[]): AssetDto[] {
  return assets.filter(a => a.status === 'ACTIVE' && a.currentValue !== null && a.assetClass !== 'CASH');
}

const SellForm: React.FC<FormProps & { assets: AssetDto[] }> = props => {
  const { v, set, assets } = props;
  const chosen = assets.find(a => a.id === v('assetId'));
  return (
    <>
      <div style={{ flex: '1 1 200px', minWidth: 160 }}>
        <SelectField
          id="op-assetId"
          label={t('Actif à vendre')}
          value={v('assetId')}
          onChange={set('assetId')}
          placeholder={t('Choisir un actif')}
          options={sellableAssets(assets).map(a => ({ value: a.id, label: a.name }))}
        />
        {chosen && chosen.outstandingDebtXof > 0 && (
          <div role="note" style={{ fontSize: 'var(--font-size-sm)', opacity: 0.8 }}>
            {t(
              "La dette adossée à cet actif n'est pas soldée par la vente : ajoutez un remboursement anticipé si besoin."
            )}
          </div>
        )}
      </div>
      <YearField {...props} />
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
  );
};

const BuyForm: React.FC<FormProps> = props => {
  const { v, set } = props;
  return (
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
        <Input id="op-name" maxLength={200} value={v('name')} onChange={event => set('name')(event.target.value)} />
      </div>
      <NumField id="op-price" label={t('Prix')} value={v('price')} onChange={set('price')} min={0} />
      <YearField {...props} />
      <NumField
        id="op-growthPercent"
        label={t('Croissance (%) (facultatif)')}
        value={v('growthPercent')}
        onChange={set('growthPercent')}
        min={-50}
        max={100}
      />
    </>
  );
};

const LoanForm: React.FC<FormProps> = props => {
  const { v, set } = props;
  return (
    <>
      <NumField id="op-amount" label={t('Montant emprunté')} value={v('amount')} onChange={set('amount')} min={0} />
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
      <YearField {...props} />
    </>
  );
};

const PrepayForm: React.FC<FormProps & { debts: DebtDto[] }> = props => {
  const { v, set, debts } = props;
  return (
    <>
      <SelectField
        id="op-loanId"
        label={t('Dette à rembourser')}
        value={v('loanId')}
        onChange={set('loanId')}
        placeholder={t('Choisir une dette')}
        options={debts.filter(d => d.status === 'ACTIVE').map(d => ({ value: d.id, label: d.lender }))}
      />
      <NumField id="op-amount" label={t('Montant remboursé')} value={v('amount')} onChange={set('amount')} min={0} />
      <YearField {...props} />
    </>
  );
};

const SavingForm: React.FC<FormProps> = props => {
  const { v, set } = props;
  return (
    <>
      <NumField id="op-amount" label={t('Montant par mois')} value={v('amount')} onChange={set('amount')} min={0} />
      <YearField {...props} name="fromYear" label={t("De l'année")} />
      <YearField {...props} name="toYear" label={t("À l'année (facultatif)")} />
    </>
  );
};

/** Sous-formulaire du type d'opération choisi. */
export const OperationFields: React.FC<FormProps & { type: OperationType; assets: AssetDto[]; debts: DebtDto[] }> = ({
  type,
  assets,
  debts,
  ...form
}) => {
  switch (type) {
    case 'SELL_ASSET':
      return <SellForm {...form} assets={assets} />;
    case 'BUY_ASSET':
      return <BuyForm {...form} />;
    case 'TAKE_LOAN':
      return <LoanForm {...form} />;
    case 'PREPAY_LOAN':
      return <PrepayForm {...form} debts={debts} />;
    case 'MONTHLY_SAVING':
      return <SavingForm {...form} />;
  }
};
