import React from 'react';
import { Col, Form, InputNumber, Radio, Row, Space } from 'antd';
import { ManagementFeeMode } from '../../services/agency-finance-settings-service';
import { t } from '../../i18n/t';

export interface FeeTermsFieldsProps {
  /**
   * Préfixe du chemin des champs dans le formulaire englobant, par exemple
   * `['override']` pour les conditions particulières d'un bail. Vide par
   * défaut : les champs de `FeeTerms` sont alors à la racine du formulaire,
   * comme pour les paramètres de l'agence ou les conditions d'un propriétaire.
   */
  namePrefix?: Array<string | number>;
}

/**
 * Champs de saisie d'un `FeeTerms` (contrat Lot 2, `lot2-contrat-api.md`) :
 * mode de calcul des honoraires de gestion, puis taux ou forfait selon le
 * mode, et assiette.
 *
 * Partagé entre les paramètres de l'agence, les conditions par propriétaire
 * et l'écran d'un bail (conditions particulières + gestionnaire) : les trois
 * écrans doivent appliquer la même règle — masquer l'assiette en mode
 * forfait, exiger un forfait strictement positif.
 *
 * Doit être rendu à l'intérieur d'un `<Form>` : il lit l'instance courante
 * via `Form.useFormInstance()` pour observer le mode choisi.
 */
export const FeeTermsFields: React.FC<FeeTermsFieldsProps> = ({ namePrefix = [] }) => {
  const form = Form.useFormInstance();
  const name = (field: string) => [...namePrefix, field];
  const mode: ManagementFeeMode | undefined = Form.useWatch(name('managementFeeMode'), form);
  const isFixed = mode === 'FIXED';

  return (
    <>
      <Form.Item label={t('Mode de calcul')} name={name('managementFeeMode')} initialValue="PERCENT">
        <Radio.Group>
          <Radio.Button value="PERCENT">{t('Pourcentage')}</Radio.Button>
          <Radio.Button value="FIXED">{t('Forfait par échéance')}</Radio.Button>
        </Radio.Group>
      </Form.Item>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          {isFixed ? (
            <Form.Item
              label={t('Forfait par échéance (FCFA)')}
              name={name('managementFeeFixedAmount')}
              extra={t("Dû en entier si l'échéance est payée en totalité, au prorata sinon.")}
              rules={[
                { required: true, message: t('Le montant du forfait est requis') },
                {
                  validator: (_rule, value) =>
                    value === null || value === undefined || value > 0
                      ? Promise.resolve()
                      : Promise.reject(new Error(t('Le forfait doit être supérieur à 0')))
                }
              ]}
            >
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          ) : (
            <Form.Item
              label={t("Taux d'honoraires (%)")}
              name={name('managementFeeRate')}
              extra={t('Laisser vide tant que le taux n’est pas décidé.')}
            >
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
          )}
        </Col>
        {!isFixed ? (
          <Col xs={24} md={12}>
            <Form.Item label={t('Calculés sur')} name={name('managementFeeBase')} initialValue="RENT_ONLY">
              <Radio.Group>
                <Space direction="vertical">
                  <Radio value="RENT_ONLY">{t('Le loyer seul, hors charges et pénalités')}</Radio>
                  <Radio value="ALL_COLLECTED">{t('Tout ce qui est encaissé')}</Radio>
                </Space>
              </Radio.Group>
            </Form.Item>
          </Col>
        ) : null}
      </Row>
    </>
  );
};
