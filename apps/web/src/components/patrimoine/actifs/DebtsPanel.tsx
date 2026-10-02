import React, { useState } from 'react';
import { App, Button, Card, Space, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createDebt,
  deleteDebt,
  listDebts,
  updateDebt,
  type DebtDto,
  type DebtInput
} from '../../../services/patrimoine-assets-service';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { ConfirmAction, StateBlock } from '../../primitives';
import { t } from '../../../i18n/t';
import { apiErrorMessage, formatAmount, formatDay } from './asset-format';
import { loanStatusLabel } from '../patrimoine-labels';
import { DebtFormModal } from './DebtFormModal';

export interface DebtsPanelProps {
  tenantId: string;
  /** Dettes adossées à cet actif ; absent : dettes personnelles (sans actif). */
  assetId?: string;
  title?: string;
}

/** Liste des dettes (d'un actif, ou personnelles) avec ajout, modification et suppression. */
export const DebtsPanel: React.FC<DebtsPanelProps> = ({ tenantId, assetId, title }) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DebtDto | null>(null);
  const filters = assetId ? { assetId } : { unattached: true };

  const debtsQuery = useQuery({
    queryKey: queryKey('patrimoine-debts', tenantId, filters),
    queryFn: () => listDebts(tenantId, filters),
    staleTime: STALE_TIME.list
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['patrimoine-debts'] }),
      queryClient.invalidateQueries({ queryKey: ['patrimoine-net-worth'] }),
      queryClient.invalidateQueries({ queryKey: ['patrimoine-assets'] })
    ]);
  };

  const handleSubmit = async (payload: DebtInput) => {
    if (editing) {
      await updateDebt(tenantId, editing.id, payload);
      message.success(t('Dette modifiée.'));
    } else {
      await createDebt(tenantId, payload);
      message.success(t('Dette ajoutée.'));
    }
    await refresh();
  };

  const handleDelete = async (debt: DebtDto) => {
    try {
      await deleteDebt(tenantId, debt.id);
      message.success(t('Dette supprimée.'));
      await refresh();
    } catch (error) {
      message.error(apiErrorMessage(error, t('Impossible de supprimer cette dette.')));
    }
  };

  const openForm = (debt: DebtDto | null) => {
    setEditing(debt);
    setModalOpen(true);
  };

  return (
    <Card
      title={title ?? (assetId ? t('Dettes adossées') : t('Dettes personnelles'))}
      extra={
        <Button icon={<PlusOutlined />} onClick={() => openForm(null)}>
          {t('Ajouter une dette')}
        </Button>
      }
    >
      {debtsQuery.error ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger les dettes.')}
          actions={[{ label: t('Réessayer'), onClick: () => debtsQuery.refetch(), primary: true }]}
        />
      ) : (
        <Table<DebtDto>
          rowKey="id"
          size="small"
          loading={debtsQuery.isPending}
          dataSource={debtsQuery.data ?? []}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{
            emptyText: assetId ? t('Aucune dette adossée à cet actif.') : t('Aucune dette personnelle.')
          }}
          columns={[
            { title: t('Prêteur'), dataIndex: 'lender' },
            {
              title: t('Capital restant dû'),
              dataIndex: 'remainingCapital',
              align: 'end',
              render: (value: number, row) => formatAmount(value, row.currency)
            },
            {
              title: t('Mensualité'),
              dataIndex: 'monthlyPayment',
              align: 'end',
              render: (value: number, row) => formatAmount(value, row.currency)
            },
            { title: t('Fin'), dataIndex: 'endDate', render: (value: string) => formatDay(value) },
            { title: t('Statut'), dataIndex: 'status', render: (value: DebtDto['status']) => loanStatusLabel(value) },
            {
              title: t('Actions'),
              key: 'actions',
              render: (_: unknown, row) => (
                <Space>
                  <a onClick={() => openForm(row)}>{t('Modifier')}</a>
                  <ConfirmAction
                    title={t('Supprimer la dette de {{preteur}} ?', { preteur: row.lender })}
                    danger
                    onConfirm={() => handleDelete(row)}
                  >
                    <a>{t('Supprimer')}</a>
                  </ConfirmAction>
                </Space>
              )
            }
          ]}
        />
      )}
      <DebtFormModal
        open={modalOpen}
        assetId={assetId}
        debt={editing}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
      />
    </Card>
  );
};
