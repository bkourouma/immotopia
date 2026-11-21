import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Empty, Input, Modal, Select, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined } from '@ant-design/icons';
import { PropertyVisit, PropertyVisitGoal, PropertyVisitStatus } from '../../types/property-types';
import { StateBlock, Table, useConfirmAction } from '../primitives';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { getPropertyVisits, updateVisitStatus, completePropertyVisit } from '../../services/property-service';
import { writeErrorMessage } from '../../utils/error-handler';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';
import { HelpSectionTitle } from '../../help';

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

// Accesseurs de la recherche locale : constantes de module (identité stable).
const TEXTE_RECHERCHE = [
  (v: PropertyVisit) => (v.contact ? `${v.contact.firstName} ${v.contact.lastName}` : undefined),
  (v: PropertyVisit) => v.assignedTo?.fullName,
  (v: PropertyVisit) => v.assignedTo?.email,
  (v: PropertyVisit) => v.notes,
  (v: PropertyVisit) => v.location
];
const ACCESSEURS = {
  status: (v: PropertyVisit) => v.status,
  goal: (v: PropertyVisit) => v.goal,
  period: (v: PropertyVisit) => v.scheduledAt
};

export const PropertyVisitsList: React.FC<PropertyVisitsListProps> = ({ propertyId, tenantId, refreshKey }) => {
  const { message } = App.useApp();
  const confirm = useConfirmAction();
  const { isMobile } = useBreakpoint();
  const [visits, setVisits] = useState<PropertyVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [closing, setClosing] = useState<PropertyVisit | null>(null);
  const [report, setReport] = useState('');

  // L'API rend toutes les visites du bien (volume borné) : recherche locale,
  // 20 lignes par page, état dans l'URL sous le préfixe « vis ».
  const criteres: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Contact, assigné à, notes…')
    },
    {
      key: 'status',
      type: 'multiSelect',
      label: t('Statut'),
      primary: true,
      options: Object.values(PropertyVisitStatus).map(value => ({ value, label: visitStatusLabel(value) }))
    },
    { key: 'period', type: 'dateRange', label: t('Date de la visite'), primary: true },
    {
      key: 'goal',
      type: 'multiSelect',
      label: t('Objectif'),
      options: Object.values(PropertyVisitGoal).map(value => ({ value, label: visitGoalLabel(value) }))
    }
  ];
  const local = useLocalListSearch<PropertyVisit>(visits, {
    paramPrefix: 'vis',
    ariaLabel: t('Rechercher dans les visites'),
    criteria: criteres,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

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

  /** Annuler une visite ou la déclarer manquée la retire de la clôture : on le confirme, en nommant la visite. */
  const requestStatus = (visit: PropertyVisit, status: PropertyVisitStatus) => {
    if (busyId) return;
    if (status !== PropertyVisitStatus.CANCELED && status !== PropertyVisitStatus.NO_SHOW) {
      void changeStatus(visit, status);
      return;
    }
    const quand = new Date(visit.scheduledAt).toLocaleString(activeLocale(), {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
    const contact = visit.contact ? `${visit.contact.firstName} ${visit.contact.lastName}` : t('sans contact');
    const annulation = status === PropertyVisitStatus.CANCELED;
    confirm({
      title: annulation
        ? t('Annuler la visite du {{date}} ({{contact}}) ?', { date: quand, contact })
        : t('Marquer la visite du {{date}} ({{contact}}) comme manquée ?', { date: quand, contact }),
      description: annulation
        ? t("La visite sort de l'agenda et ne pourra plus être clôturée.")
        : t("Le contact ne s'est pas présenté : la visite ne pourra plus être clôturée."),
      okText: annulation ? t('Annuler la visite') : t('Marquer comme manquée'),
      cancelText: t('Garder la visite'),
      danger: annulation,
      onConfirm: () => changeStatus(visit, status)
    });
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
            style={{ minWidth: 150, minHeight: 'var(--touch-target-min, 44px)' }}
            value={v.status}
            loading={busyId === v.id}
            disabled={busyId === v.id}
            aria-label={t('Statut de la visite')}
            onChange={(status: PropertyVisitStatus) => requestStatus(v, status)}
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
          <Button
            icon={<CheckCircleOutlined />}
            style={{ minHeight: 'var(--touch-target-min, 44px)' }}
            disabled={busyId === v.id}
            onClick={() => openClosing(v)}
          >
            {t('Clôturer')}
          </Button>
        )
    }
  ];

  return (
    <Card title={<HelpSectionTitle title={t('Visites du bien')} helpId="commercial.biens.detail.visites" />}>
      {error && visits.length === 0 ? (
        <StateBlock
          variant="error"
          title={t('Impossible de charger les visites')}
          description={error}
          actions={[{ label: t('Réessayer'), onClick: () => void load(), primary: true }]}
        />
      ) : (
        <Table<PropertyVisit>
          helpId="commercial.biens.detail.visites.tableau"
          {...local.tableProps}
          exportFetchAll={local.exportAll}
          exportFilename={t('Visites du bien')}
          aria-label={t('Visites du bien')}
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          scroll={{ x: 'max-content' }}
          // Sous critère, la Table affiche seule son bloc « Aucun résultat ».
          locale={
            local.isFiltered
              ? undefined
              : {
                  emptyText: (
                    <Empty description={t('Aucune visite pour ce bien')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )
                }
          }
        />
      )}
      {error && visits.length > 0 && (
        <StateBlock
          variant="error"
          title={t('Impossible de charger les visites')}
          description={error}
          actions={[{ label: t('Réessayer'), onClick: () => void load(), primary: true }]}
        />
      )}
      <Modal
        open={closing !== null}
        title={t('Clôturer la visite')}
        okText={t('Marquer comme terminée')}
        cancelText={t('Annuler')}
        confirmLoading={closing !== null && busyId === closing.id}
        onOk={confirmClosing}
        onCancel={() => setClosing(null)}
        // Plein écran sous 768 px, comme les autres formulaires de la fiche.
        width={isMobile ? '100%' : 520}
        style={isMobile ? { top: 0, maxWidth: '100vw', margin: 0, paddingBottom: 0 } : undefined}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>{t('Compte-rendu de la visite (optionnel)')}</Text>
          <TextArea rows={4} value={report} onChange={e => setReport(e.target.value)} maxLength={2000} showCount />
        </Space>
      </Modal>
    </Card>
  );
};
