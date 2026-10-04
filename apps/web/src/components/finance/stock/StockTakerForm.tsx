import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, App, Button, Form, Input, Select, Space, Typography } from 'antd';
import { createStockTaker } from '../../../services/finance-stock-controle-service';
import type { StockPerson, StockTakerView } from '../../../types/finance-stock-controle-types';
import { t } from '../../../i18n/t';

const { Text } = Typography;

export interface StockTakerFormProps {
  /** Appelé avec le preneur créé. */
  onCreated: (taker: StockTakerView) => void;
  /** Employés et tâcherons liables (`FieldContext.people`, vide sans STOCK_TAKERS_MANAGE). */
  people: StockPerson[];
  /** Agence ; à défaut, celle de l'adresse (`/tenant/:tenantId/…`). */
  tenantId?: string;
  /** Doublon refusé par le serveur (409 STOCK_TAKER_DUPLICATE) : propose de choisir le preneur existant. */
  onDuplicate?: (existingTakerId: string) => void;
  /**
   * Libellé du bouton proposé sur un doublon : « Choisir ce preneur » dans un
   * sélecteur (ecrans §3), « Voir ce preneur » dans le carnet (ecrans §9).
   */
  duplicateActionLabel?: string;
  onCancel?: () => void;
}

interface FormValues {
  fullName: string;
  teamOrCompany?: string;
  phone?: string;
  person?: string;
}

/** Valeur d'option d'une personne liable : `EMPLOYEE:<id>` ou `CONTRACTOR:<id>`. */
function personKey(person: StockPerson): string {
  return `${person.kind}:${person.id}`;
}

/**
 * Ajout d'un preneur au carnet (spec B2-R1, ecrans §4) : nom complet, équipe
 * ou entreprise, téléphone, et un lien facultatif vers un employé OU un
 * tâcheron. Rien d'autre — ni pièce d'identité, ni photo, ni note libre
 * (spec §10).
 */
export const StockTakerForm: React.FC<StockTakerFormProps> = ({
  onCreated,
  people,
  tenantId: tenantIdProp,
  onDuplicate,
  duplicateActionLabel,
  onCancel
}) => {
  const params = useParams<{ tenantId: string }>();
  const tenantId = tenantIdProp ?? params.tenantId;
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  const submit = async (values: FormValues) => {
    if (!tenantId) return;
    const person = people.find(candidate => personKey(candidate) === values.person);
    setSaving(true);
    setDuplicateId(null);
    try {
      const created = await createStockTaker(tenantId, {
        fullName: values.fullName,
        teamOrCompany: values.teamOrCompany ?? null,
        phone: values.phone ?? null,
        employeeId: person?.kind === 'EMPLOYEE' ? person.id : null,
        contractorId: person?.kind === 'CONTRACTOR' ? person.id : null
      });
      form.resetFields();
      onCreated(created);
    } catch (error: any) {
      const data = error?.response?.data;
      if (data?.code === 'STOCK_TAKER_DUPLICATE' && data?.data?.existingTakerId) {
        setDuplicateId(String(data.data.existingTakerId));
      } else {
        message.error(data?.message || t('Le preneur n’a pas pu être ajouté.'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form<FormValues> form={form} layout="vertical" onFinish={submit} requiredMark="optional">
      <Text type="secondary" style={{ display: 'block', marginBlockEnd: 12 }}>
        {t('Le nom du preneur est imprimé sur les bons de sortie. Ne saisissez que ce qui sert à le reconnaître.')}
      </Text>
      <Form.Item
        name="fullName"
        label={t('Nom complet')}
        rules={[
          { required: true, whitespace: true, message: t('Indiquez le nom complet du preneur.') },
          { min: 2, max: 120, message: t('Le nom compte de 2 à 120 caractères.') }
        ]}
      >
        <Input maxLength={120} autoComplete="off" />
      </Form.Item>
      <Form.Item name="teamOrCompany" label={t('Équipe ou entreprise')} rules={[{ max: 120 }]}>
        <Input maxLength={120} autoComplete="off" />
      </Form.Item>
      <Form.Item name="phone" label={t('Téléphone')} rules={[{ max: 30 }]}>
        <Input maxLength={30} inputMode="tel" autoComplete="off" />
      </Form.Item>
      {people.length > 0 ? (
        <Form.Item name="person" label={t('Lier à un employé ou un tâcheron')}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            options={people.map(person => ({
              value: personKey(person),
              label:
                person.kind === 'EMPLOYEE'
                  ? t('{{name}} (employé)', { name: person.fullName })
                  : t('{{name}} (tâcheron)', { name: person.fullName })
            }))}
          />
        </Form.Item>
      ) : null}

      {duplicateId ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBlockEnd: 12 }}
          message={t('Un preneur actif porte déjà ce nom dans cette équipe.')}
          action={
            onDuplicate ? (
              <Button size="small" onClick={() => onDuplicate(duplicateId)}>
                {duplicateActionLabel ?? t('Choisir ce preneur')}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <Space>
        <Button type="primary" htmlType="submit" loading={saving} style={{ minHeight: 44 }}>
          {t('Ajouter le preneur')}
        </Button>
        {onCancel ? (
          <Button onClick={onCancel} style={{ minHeight: 44 }}>
            {t('Annuler')}
          </Button>
        ) : null}
      </Space>
    </Form>
  );
};

export default StockTakerForm;
