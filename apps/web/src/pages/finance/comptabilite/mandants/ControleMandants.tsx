import React from 'react';
import { Alert } from 'antd';
import type { MandantControl } from '../../../../services/accounting-exports-service';
import { MoneyValue, formatMoney } from '../../../../components/primitives/MoneyValue';
import { t } from '../../../../i18n/t';

/**
 * Contrôle « total auxiliaire = solde général du compte de fonds ». Muet quand
 * les deux coïncident ; sinon une alerte avec les deux totaux et l'écart.
 */
export const ControleMandants: React.FC<{
  control: MandantControl | undefined;
  accountNumber: string | undefined;
  message: string;
}> = ({ control, accountNumber, message }) => {
  if (!control || control.isBalanced) return null;
  return (
    <Alert
      type="error"
      showIcon
      message={message}
      description={
        <div>
          <div>
            {t('Total auxiliaire')} : <MoneyValue value={control.auxiliaryBalance} signed />
          </div>
          <div>
            {t('Solde général du compte {{numero}}', { numero: accountNumber ?? '' })} :{' '}
            <MoneyValue value={control.generalBalance} signed />
          </div>
          <div>{t('Écart : {{montant}}', { montant: formatMoney(control.difference, { currency: null }) })}</div>
        </div>
      }
      style={{ marginBlockEnd: 'var(--space-4)' }}
    />
  );
};
