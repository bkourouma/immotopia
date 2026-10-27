import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Card, Empty, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined } from '@ant-design/icons';
import { PropertyVisit, PropertyVisitGoal, PropertyVisitStatus } from '../../types/property-types';
import { getPropertyVisits, updateVisitStatus, completePropertyVisit } from '../../services/property-service';
import { writeErrorMessage } from '../../utils/error-handler';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Text } = Typography;
const { TextArea } = Input;

interface PropertyVisitsListProps {
  propertyId: string;
  tenantId: string;
  /** Changé par le parent pour recharger la liste (visite planifiée). */
  refreshKey?: number;
}

const STATUS_COLORS: Record<string, string> = {
  [PropertyVisitStatus.SCHEDULED]: 'blue',
  [PropertyVisitStatus.CONFIRMED]: 'green',
  [PropertyVisitStatus.DONE]: 'default',
  [PropertyVisitStatus.NO_SHOW]: 'orange',
  [PropertyVisitStatus.CANCELED]: 'red'
};

export function visitStatusLabel(status: PropertyVisitStatus | string): string {
  switch (status) {
    case PropertyVisitStatus.SCHEDULED:
      return t('Planifié');
    case PropertyVisitStatus.CONFIRMED:
      return t('Confirmé');
    case PropertyVisitStatus.DONE:
      return t('Terminé');
    case PropertyVisitStatus.NO_SHOW:
      return t('Absent');
    case PropertyVisitStatus.CANCELED:
      return t('Annulé');
    default:
      return String(status);
  }
}

export function visitGoalLabel(goal?: PropertyVisitGoal | string): string {
  switch (goal) {
    case PropertyVisitGoal.CONTACT_TAKING:
      return t('Prise de contact');
    case PropertyVisitGoal.NETWORKING:
      return t('Mise en relation');
    case PropertyVisitGoal.EVALUATION:
      return t('Évaluation');
    case PropertyVisitGoal.CONTRACT_SIGNING:
      return t('Signature du contrat');
    case PropertyVisitGoal.FOLLOW_UP:
      return t('Suivi');
    case PropertyVisitGoal.NEGOTIATION:
      return t('Négociation');
    case PropertyVisitGoal.OTHER:
      return t('Autre');
    default:
      return '—';
  }
}

/** Statuts posés à la main ; « Terminé » passe par la clôture avec compte-rendu. */
const MANUAL_STATUSES = [
  PropertyVisitStatus.SCHEDULED,
  PropertyVisitStatus.CONFIRMED,
  PropertyVisitStatus.NO_SHOW,
  PropertyVisitStatus.CANCELED
];

export const PropertyVisitsList: React.FC<PropertyVisitsListProps> = ({ propertyId, tenantId, refreshKey }) => {
  const { message } = App.useApp();
  const [visits, setVisits] = useState<PropertyVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [closing, setClosing] = useState<PropertyVisit | null>(null);
  const [report, setReport] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setVisits(await getPropertyVisits(tenantId, propertyId));
    } catch (err) {
      setError(
        writeErrorMessage(
          err,
          t('Erreur lors du chargement des visites'),
          t("Vous n'avez pas les droits nécessaires pour consulter les visites.")
        )
      );
    } finally {
      setLoading(false);
    }
  }, [tenantId, propertyId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const forbidden = t("Vous n'avez pas les droits nécessaires pour modifier cette visite.");

  const changeStatus = async (visit: PropertyVisit, status: PropertyVisitStatus) => {
    setBusyId(visit.id);
    try {
      await updateVisitStatus(tenantId, propertyId, visit.id, status);
      message.success(t('Statut de la visite mis à jour'));
      await load();
    } catch (err) {
      message.error(writeErrorMessage(err, t('Erreur lors de la mise à jour de la visite'), forbidden));
    } finally {
      setBusyId(null);
    }
  };

  const openClosing = (visit: PropertyVisit) => {
    setClosing(visit);
    // La note de planification sert de base au compte-rendu.
    setReport(visit.notes || '');
  };

  const confirmClosing = async () => {
    if (!closing) return;
    setBusyId(closing.id);
    try {
      await completePropertyVisit(tenantId, propertyId, closing.id, report.trim() || undefined);
      message.success(t('Visite clôturée'));
      setClosing(null);
      await load();
    } catch (err) {
      message.error(writeErrorMessage(err, t('Erreur lors de la clôture de la visite'), forbidden));
    } finally {
      setBusyId(null);
    }
  };

  const columns: ColumnsType<PropertyVisit> = [
    {
      title: t('Date'),
      dataIndex: 'scheduledAt',
      key: 'scheduledAt',
      render: (value: string) =>
        new Date(value).toLocaleString(activeLocale(), { dateStyle: 'medium', timeStyle: 'short' })
    },
    {
      title: t('Contact'),
      key: 'contact',
      render: (_: unknown, v) => (v.contact ? `${v.contact.firstName} ${v.contact.lastName}` : '—')
    },
    { title: t('Objectif'), key: 'goal', render: (_: unknown, v) => visitGoalLabel(v.goal) },
    {
      title: t('Assigné à'),
      key: 'assignedTo',
      render: (_: unknown, v) => v.assignedTo?.fullName || v.assignedTo?.email || '—'
    },
    {
      title: t('Statut'),
      key: 'status',
      render: (_: unknown, v) =>
        v.status === PropertyVisitStatus.DONE ? (
          <Tag color={STATUS_COLORS[v.status]}>{visitStatusLabel(v.status)}</Tag>
        ) : (
          <Select
            size="small"
            style={{ minWidth: 130 }}
            value={v.status}
            loading={busyId === v.id}
            disabled={busyId === v.id}
            aria-label={t('Statut de la visite')}
            onChange={(status: PropertyVisitStatus) => changeStatus(v, status)}
            options={MANUAL_STATUSES.map(s => ({ value: s, label: visitStatusLabel(s) }))}
          />
        )
    },
    {
      title: t('Notes'),
      dataIndex: 'notes',
      key: 'notes',
      render: (value?: string) => (value ? <Text>{value}</Text> : <Text type="secondary">—</Text>)
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_: unknown, v) =>
        v.status === PropertyVisitStatus.DONE || v.status === PropertyVisitStatus.CANCELED ? null : (
          <Button size="small" icon={<CheckCircleOutlined />} onClick={() => openClosing(v)}>
            {t('Clôturer')}
          </Button>
        )
    }
  ];

  return (
    <Card title={t('Visites du bien')}>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Table<PropertyVisit>
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={visits}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{
          emptyText: <Empty description={t('Aucune visite pour ce bien')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        }}
      />
      <Modal
        open={closing !== null}
        title={t('Clôturer la visite')}
        okText={t('Marquer comme terminée')}
        cancelText={t('Annuler')}
        confirmLoading={closing !== null && busyId === closing.id}
        onOk={confirmClosing}
        onCancel={() => setClosing(null)}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>{t('Compte-rendu de la visite (optionnel)')}</Text>
          <TextArea rows={4} value={report} onChange={e => setReport(e.target.value)} maxLength={2000} showCount />
        </Space>
      </Modal>
    </Card>
  );
};
