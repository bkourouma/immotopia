import React from 'react';
import { Form, Input } from 'antd';
import { t } from '../../i18n/t';

/** Devise ISO 4217 par défaut d'une nouvelle police ou entrée (franc CFA). */
export const DEFAULT_CURRENCY = 'XOF';

/**
 * Champ « Devise » (3 lettres majuscules, comme l'exige l'API). Les libellés
 * de montant du formulaire suivent la valeur saisie : jamais de devise en dur.
 */
export const CurrencyField: React.FC = () => (
  <Form.Item
    name="currency"
    label={t('Devise')}
    normalize={(value?: string) => (value ?? '').toUpperCase()}
    rules={[
      { required: true, message: t('Champ requis') },
      { pattern: /^[A-Z]{3}$/, message: t('3 lettres majuscules (ex. XOF)') }
    ]}
  >
    <Input maxLength={3} style={{ maxWidth: 120 }} />
  </Form.Item>
);

/** `currency` à envoyer dans un PATCH : seulement si elle a été modifiée (l'API refuse (409) de changer la devise d'une police qui a des sinistres). */
export function changedCurrency(current: string | undefined, original: string): { currency?: string } {
  return current && current !== original ? { currency: current } : {};
}
