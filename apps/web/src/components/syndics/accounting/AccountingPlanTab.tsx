import React, { useMemo } from 'react';
import { Button, Spin, Tag, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { Table } from '../../primitives';
import type { ChartOfAccount } from '../../../types/syndic-types';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import { t } from '../../../i18n/t';
import {
  ACCOUNT_TYPE_VALUES,
  LOCAL_PAGE_SIZE_LISTS,
  PLAN_PREFIX,
  accountClassOptions,
  accountTypeLabel
} from './accounting-shared';

const { Paragraph } = Typography;

// Accesseurs stables (hors composant) : le filtrage reste mémoïsé.
const TEXTE_RECHERCHE = [
  (account: ChartOfAccount) => account.accountNumber,
  (account: ChartOfAccount) => account.accountName
];
const ACCESSEURS = {
  classe: (account: ChartOfAccount) => String(account.accountClass),
  type: (account: ChartOfAccount) => account.accountType,
  actif: (account: ChartOfAccount) => account.isActive
};

interface AccountingPlanTabProps {
  /** Plan comptable complet (borné), chargé une fois par l'écran. */
  accounts: ChartOfAccount[];
  loading: boolean;
  submitting: boolean;
  onLoadTemplate: () => void;
}

/** Plan comptable : liste bornée reçue en entier, recherche et pagination locales (préfixe `plan`). */
export const AccountingPlanTab: React.FC<AccountingPlanTabProps> = ({
  accounts,
  loading,
  submitting,
  onLoadTemplate
}) => {
  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Numéro ou intitulé du compte…')
    },
    {
      key: 'classe',
      type: 'multiSelect',
      label: t('Classe'),
      primary: true,
      options: accountClassOptions()
    },
    {
      key: 'type',
      type: 'multiSelect',
      label: t('Type'),
      primary: true,
      options: ACCOUNT_TYPE_VALUES.map(value => ({ value, label: accountTypeLabel(value) }))
    },
    {
      key: 'actif',
      type: 'boolean',
      label: t('Actif'),
      tristate: true,
      trueLabel: t('Actifs'),
      falseLabel: t('Inactifs')
    }
  ];

  const local = useLocalListSearch<ChartOfAccount>(accounts, {
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS,
    defaultPageSize: LOCAL_PAGE_SIZE_LISTS,
    paramPrefix: PLAN_PREFIX,
    ariaLabel: t('Rechercher dans le plan comptable')
  });

  const columns = useMemo(
    () => [
      { title: t('Numéro'), dataIndex: 'accountNumber' },
      { title: t('Intitulé'), dataIndex: 'accountName' },
      { title: t('Classe'), dataIndex: 'accountClass' },
      {
        title: t('Type'),
        dataIndex: 'accountType',
        render: (value: ChartOfAccount['accountType']) => accountTypeLabel(value)
      },
      {
        title: t('Actif'),
        render: (_: unknown, account: ChartOfAccount) =>
          account.isActive ? <Tag color="green">{t('Actif')}</Tag> : <Tag color="red">{t('Inactif')}</Tag>
      }
    ],
    []
  );

  if (loading) return <Spin />;

  if (accounts.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <Paragraph type="secondary">
          {t(
            'Le plan comptable de cette copropriété est vide. Chargez le plan SYSCOHADA de copropriété pour démarrer.'
          )}
        </Paragraph>
        <Button type="primary" icon={<DownloadOutlined />} onClick={onLoadTemplate} loading={submitting}>
          {t('Charger le plan SYSCOHADA')}
        </Button>
      </div>
    );
  }

  return (
    <Table<ChartOfAccount>
      {...local.tableProps}
      helpId="syndic.comptabilite.plan"
      exportFilename={t('Plan comptable')}
      exportFetchAll={local.exportAll}
      scroll={{ x: 'max-content' }}
      rowKey="id"
      columns={columns}
    />
  );
};
