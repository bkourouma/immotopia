import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Space, Typography, Empty, Tag, Button } from 'antd';
import { Table } from '../primitives';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { TicketStatusBadge } from '../maintenance/TicketStatusBadge';
import { propertyMaintenanceService } from '../../services/maintenance-service';
import { Ticket, MaintenanceTicketStatus } from '../../types/maintenance-types';
import { safeFormatDate } from '../../utils/date-utils';
import { t } from '../../i18n/t';
import { localizedRecord } from '../../i18n/localized';

const { Title } = Typography;

const categoryLabels: Record<string, string> = localizedRecord(() => ({
  PLUMBING: 'Plomberie',
  ELECTRICITY: t('Électricité'),
  AC: 'Climatisation',
  OTHER: 'Autre'
}));

const priorityLabels: Record<string, string> = localizedRecord(() => ({
  LOW: 'Faible',
  MEDIUM: 'Moyenne',
  HIGH: t('Élevée'),
  URGENT: 'Urgente'
}));

const priorityColors: Record<string, string> = {
  LOW: 'default',
  MEDIUM: 'processing',
  HIGH: 'warning',
  URGENT: 'error'
};

// Accesseurs de la recherche locale : constantes de module (identité stable).
const TEXTE_RECHERCHE = [
  (ticket: Ticket) => ticket.title,
  (ticket: Ticket) => ticket.description,
  (ticket: Ticket) => ticket.assignedVendor?.name,
  (ticket: Ticket) => ticket.lease?.leaseNumber
];
const ACCESSEURS = {
  status: (ticket: Ticket) => ticket.status,
  category: (ticket: Ticket) => ticket.category,
  priority: (ticket: Ticket) => ticket.priority,
  created: (ticket: Ticket) => ticket.createdAt
};

interface PropertyMaintenanceTabProps {
  propertyId: string;
  tenantId: string;
}

export const PropertyMaintenanceTab: React.FC<PropertyMaintenanceTabProps> = ({ propertyId, tenantId }) => {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tenantId && propertyId) {
      loadHistory();
    }
  }, [tenantId, propertyId]);

  // L'API rend tout l'historique du bien (volume borné) : la recherche est
  // locale, pagination de 20 lignes, état dans l'URL sous le préfixe « mnt ».
  const criteres: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Titre, description, prestataire…')
    },
    {
      key: 'status',
      type: 'multiSelect',
      label: t('Statut'),
      primary: true,
      options: [
        { value: 'DECLARED', label: t('Déclaré') },
        { value: 'IN_PROGRESS', label: t('En cours') },
        { value: 'ASSIGNED', label: t('Assigné') },
        { value: 'RESOLVED', label: t('Résolu') },
        { value: 'CANCELED', label: t('Annulé') }
      ]
    },
    {
      key: 'category',
      type: 'multiSelect',
      label: t('Catégorie'),
      primary: true,
      options: [
        { value: 'PLUMBING', label: t('Plomberie') },
        { value: 'ELECTRICITY', label: t('Électricité') },
        { value: 'AC', label: t('Climatisation') },
        { value: 'OTHER', label: t('Autre') }
      ]
    },
    {
      key: 'priority',
      type: 'multiSelect',
      label: t('Priorité'),
      options: [
        { value: 'LOW', label: t('Faible') },
        { value: 'MEDIUM', label: t('Moyenne') },
        { value: 'HIGH', label: t('Élevée') },
        { value: 'URGENT', label: t('Urgente') }
      ]
    },
    { key: 'created', type: 'dateRange', label: t('Date de création') }
  ];
  const local = useLocalListSearch<Ticket>(tickets, {
    paramPrefix: 'mnt',
    ariaLabel: t('Rechercher dans la maintenance'),
    criteria: criteres,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  const loadHistory = async () => {
    if (!tenantId || !propertyId) return;

    setLoading(true);
    try {
      const response = await propertyMaintenanceService.getHistory(tenantId, propertyId);
      if (response.success) {
        setTickets(response.data);
      }
    } catch (error) {
      console.error('Error loading maintenance history:', error);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: t('Titre'),
      dataIndex: 'title',
      key: 'title',
      render: (text: string, record: Ticket) => (
        <Button type="link" onClick={() => navigate(`/tenant/${tenantId}/admin/maintenance/tickets/${record.id}`)}>
          {text}
        </Button>
      )
    },
    {
      title: t('Catégorie'),
      dataIndex: 'category',
      key: 'category',
      render: (category: string) => categoryLabels[category] || category
    },
    {
      title: t('Priorité'),
      dataIndex: 'priority',
      key: 'priority',
      render: (priority: string) => <Tag color={priorityColors[priority]}>{priorityLabels[priority] || priority}</Tag>
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (status: MaintenanceTicketStatus) => <TicketStatusBadge status={status} />
    },
    {
      title: t('Prestataire'),
      dataIndex: ['assignedVendor', 'name'],
      key: 'assignedVendor',
      render: (name: string) => name || '-'
    },
    {
      title: t('Date de création'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string | null | undefined) => safeFormatDate(date, 'DD MMM YYYY', '-')
    }
  ];

  return (
    <div>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div className="it-toolbar">
          <Title level={5} className="it-toolbar__title" style={{ margin: 0 }}>
            {t('Historique de maintenance')}
          </Title>
        </div>

        {tickets.length === 0 && !loading ? (
          <Empty
            description={t('Aucun ticket de maintenance pour cette propriété')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Table
            exportFilename={t('Historique de maintenance')}
            {...local.tableProps}
            exportFetchAll={local.exportAll}
            aria-label={t('Historique de maintenance')}
            columns={columns}
            rowKey="id"
            loading={loading}
            size="middle"
            // Six colonnes ne tiennent pas sous 992 px : le tableau defile
            // horizontalement plutot que de comprimer ses colonnes.
            scroll={{ x: 'max-content' }}
          />
        )}
      </Space>
    </div>
  );
};
