import React from 'react';
import { Form, Input, InputNumber, Select } from 'antd';
import type { FormInstance } from 'antd';
import { ChargeSchedule, ChargeScheduleAmountSource, ChargeScheduleFrequency } from '../../../types/syndic-types';
import { t } from '../../../i18n/t';
import { amountSourceLabels, frequencyLabels } from './chargeScheduleLabels';
import { ScheduleFormValues } from './types';

export const ScheduleFormFields: React.FC<{
  form: FormInstance<ScheduleFormValues>;
  editing: ChargeSchedule | null;
  approvedBudgetOptions: Array<{ value: string; label: string }>;
  watchedAmountSource?: ChargeScheduleAmountSource;
}> = ({ form, editing, approvedBudgetOptions, watchedAmountSource }) => (
  <Form form={form} layout="vertical">
    <Form.Item label={t('Libellé')} name="label" rules={[{ required: true, message: t('Le libellé est obligatoire') }]}>
      <Input placeholder={t('Ex : Charges courantes trimestrielles')} />
    </Form.Item>

    <Form.Item
      label={t('Fréquence')}
      name="frequency"
      rules={[{ required: true }]}
      extra={
        editing?.hasIssuedPeriods
          ? t('Des périodes ont déjà été émises : la fréquence ne peut plus changer.')
          : undefined
      }
    >
      <Select
        disabled={Boolean(editing?.hasIssuedPeriods)}
        options={(Object.keys(frequencyLabels) as ChargeScheduleFrequency[]).map(value => ({
          value,
          label: frequencyLabels[value]
        }))}
      />
    </Form.Item>

    <Form.Item
      label={t("Jour d'émission")}
      name="issueDay"
      rules={[{ required: true, message: t("Le jour d'émission est obligatoire") }]}
      extra={t(
        "Le jour d'émission est le jour du premier mois de chaque période (1 à 28, pour rester valable tous les mois)."
      )}
    >
      <InputNumber min={1} max={28} style={{ width: '100%' }} />
    </Form.Item>

    <Form.Item
      label={t('Délai avant échéance (jours)')}
      name="dueOffsetDays"
      rules={[{ required: true, message: t('Le délai est obligatoire') }]}
      extra={t("Nombre de jours entre l'émission de l'appel et sa date d'échéance.")}
    >
      <InputNumber min={0} max={365} style={{ width: '100%' }} />
    </Form.Item>

    <Form.Item label={t('Source du montant')} name="amountSource" rules={[{ required: true }]}>
      <Select
        options={(Object.keys(amountSourceLabels) as ChargeScheduleAmountSource[]).map(value => ({
          value,
          label: amountSourceLabels[value]
        }))}
      />
    </Form.Item>

    {watchedAmountSource === 'BUDGET' ? (
      <Form.Item
        label={t('Budget')}
        name="budgetId"
        rules={[{ required: true, message: t('Choisissez un budget approuvé') }]}
        extra={t(
          "Seuls les budgets APPROUVÉS de la copropriété apparaissent : chaque exécution reprend le budget approuvé de l'exercice au moment de l'émission."
        )}
      >
        <Select
          showSearch
          optionFilterProp="label"
          placeholder={t('Budget approuvé de l’exercice')}
          options={approvedBudgetOptions}
          notFoundContent={t('Aucun budget approuvé pour cette copropriété.')}
        />
      </Form.Item>
    ) : (
      <Form.Item
        label={t('Montant fixe')}
        name="fixedAmount"
        rules={[{ required: true, message: t('Le montant fixe est obligatoire') }]}
        extra={t(
          'Montant fixe réparti par tantièmes entre les lots principaux (appartements, bureaux, locaux commerciaux).'
        )}
      >
        <InputNumber min={1} style={{ width: '100%' }} />
      </Form.Item>
    )}

    <Form.Item
      label={t('Devise')}
      name="currency"
      rules={[{ required: true, message: t('La devise est obligatoire') }]}
    >
      <Input />
    </Form.Item>

    <Form.Item
      label={t('Date de début')}
      name="startDate"
      rules={[{ required: true, message: t('La date de début est obligatoire') }]}
      extra={
        editing?.hasIssuedPeriods
          ? t('Des périodes ont déjà été émises : la date de début ne peut plus changer.')
          : undefined
      }
    >
      <Input type="date" disabled={Boolean(editing?.hasIssuedPeriods)} />
    </Form.Item>

    <Form.Item label={t('Date de fin (optionnelle)')} name="endDate">
      <Input type="date" />
    </Form.Item>

    <Form.Item
      label={t('Active')}
      name="active"
      tooltip={t('Une programmation en pause ne génère plus rien, mais garde son historique.')}
    >
      <Select
        options={[
          { value: true, label: t('Active') },
          { value: false, label: t('En pause') }
        ]}
      />
    </Form.Item>
  </Form>
);
