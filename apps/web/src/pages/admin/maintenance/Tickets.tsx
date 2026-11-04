import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Typography, Tag, Spin } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { Table } from '../../../components/primitives';
import { collectAllPages } from '../../../utils/table-export/collect';
import { TicketStatusBadge } from '../../../components/maintenance/TicketStatusBadge';
import { managerMaintenanceService, vendorMaintenanceService } from '../../../services/maintenance-service';
import { getProperty, listProperties } from '../../../services/property-service';
import { useListSearch } from '../../../hooks/useListSearch';
import { Ticket, MaintenanceTicketStatus } from '../../../types/maintenance-types';
import { useAuth } from '../../../hooks/useAuth';
import { safeFormatDate } from '../../../utils/date-utils';
import dayjs from 'dayjs';
import { localizedList } from '../../../i18n/localized';
import { t } from '../../../i18n/t';
import { localizedRecord } from '../../../i18n/localized';

const { Title } = Typography;

const categoryLabels: Record<string, string> = localizedRecord(() => ({
  PLUMBING: t('Plomberie'),
  ELECTRICITY: t('Électricité'),
  AC: t('Climatisation'),
  OTHER: t('Autre')
}));

const priorityLabels: Record<string, string> = localizedRecord(() => ({
  LOW: t('Faible'),
  MEDIUM: t('Moyenne'),
  HIGH: t('Élevée'),
  URGENT: t('Urgente')
}));

// Libellés vivants (suivent la langue) pour les listes de critères.
const STATUS_OPTIONS = localizedList(() => [
  { value: 'DECLARED', label: t('Déclaré') },
  { value: 'IN_PROGRESS', label: t('En cours') },
  { value: 'ASSIGNED', label: t('Assigné') },
  { value: 'RESOLVED', label: t('Résolu') },
  { value: 'CANCELED', label: t('Annulé') }
]);
const PRIORITY_OPTIONS = localizedList(() => [
  { value: 'LOW', label: t('Faible') },
  { value: 'MEDIUM', label: t('Moyenne') },
  { value: 'HIGH', label: t('Élevée') },
  { value: 'URGENT', label: t('Urgente') }
]);
const CATEGORY_OPTIONS = localizedList(() => [
  { value: 'PLUMBING', label: t('Plomberie') },
  { value: 'ELECTRICITY', label: t('Électricité') },
  { value: 'AC', label: t('Climatisation') },
  { value: 'OTHER', label: t('Autre') }
]);

const propertyOptionLabel = (property: { internalReference?: string; title?: string }) =>
  [property.internalReference, property.title].filter(Boolean).join(' · ');

const priorityColors: Record<string, string> = {
  LOW: 'default',
  MEDIUM: 'processing',
  HIGH: 'warning',
  URGENT: 'error'
};

export const Tickets: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  // Premier chargement terminé : le spinner plein écran ne remplace plus la page ensuite
  // (la barre de recherche garde son focus, même quand une recherche ne donne rien).
  const [loaded, setLoaded] = useState(false);

  // Les critères `loadOptions` / `resolveLabel` sont figés au premier rendu : l'agence
  // est lue dans une référence.
  const tenantRef = useRef(effectiveTenantId);
  tenantRef.current = effectiveTenantId;

  // Recherche multicritères portée par l'URL (?q=…&status=DECLARED&propertyId=…&page=2).
  const search = useListSearch({
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Titre, description, bien, prestataire…')
      },
      { key: 'status', type: 'select', label: t('Statut'), primary: true, options: STATUS_OPTIONS },
      { key: 'priority', type: 'select', label: t('Priorité'), primary: true, options: PRIORITY_OPTIONS },
      { key: 'category', type: 'select', label: t('Catégorie'), options: CATEGORY_OPTIONS },
      {
        key: 'propertyId',
        type: 'select',
        label: t('Bien'),
        loadOptions: async term => {
          const { properties } = await listProperties(tenantRef.current as string, { q: term || undefined, limit: 20 });
          return properties.map(property => ({ value: property.id, label: propertyOptionLabel(property) }));
        },
        resolveLabel: async id => propertyOptionLabel(await getProperty(tenantRef.current as string, id))
      },
      {
        key: 'assignedVendorId',
        type: 'select',
        label: t('Prestataire'),
        loadOptions: async term => {
          const response = await vendorMaintenanceService.listVendors(tenantRef.current as string, {
            search: term || undefined,
            limit: 20
          });
          return (response.data ?? []).map((vendor: { id: string; name: string }) => ({
            value: vendor.id,
            label: vendor.name
          }));
        },
        resolveLabel: async id => (await vendorMaintenanceService.getVendor(tenantRef.current as string, id)).data?.name
      },
      { key: 'created', type: 'dateRange', label: t('Créé du / au'), api: ['dateFrom', 'dateTo'] }
    ]
  });
  const paramsRef = useRef(search.apiParams);
  paramsRef.current = search.apiParams;
  const paramsKey = JSON.stringify(search.apiParams);

  useEffect(() => {
    if (effectiveTenantId) {
      loadTickets();
    }
  }, [effectiveTenantId, paramsKey]);

  const loadTickets = async () => {
    if (!effectiveTenantId) return;

    setLoading(true);
    try {
      const response = await managerMaintenanceService.listTickets(effectiveTenantId, paramsRef.current as never);
      if (response.success) {
        setTickets(response.data);
        setTotal(response.pagination?.total ?? response.data.length);
      }
    } catch (error) {
      console.error('Error loading tickets:', error);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  const columns = [
    {
      title: t('Titre'),
      dataIndex: 'title',
      key: 'title',
      width: 200,
      ellipsis: true,
      render: (text: string, record: Ticket) => (
        <Button
          type="link"
          onClick={() => navigate(`/tenant/${effectiveTenantId}/admin/maintenance/tickets/${record.id}`)}
          style={{
            padding: 0,
            textAlign: 'start',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block'
          }}
          title={text}
        >
          {text}
        </Button>
      )
    },
    {
      title: t('Propriété'),
      dataIndex: ['property', 'address'],
      key: 'property',
      width: 200,
      ellipsis: true,
      render: (address: string) => address || 'N/A'
    },
    {
      title: t('Catégorie'),
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (category: string) => categoryLabels[category] || category
    },
    {
      title: t('Priorité'),
      dataIndex: 'priority',
      key: 'priority',
      width: 120,
      render: (priority: string) => <Tag color={priorityColors[priority]}>{priorityLabels[priority] || priority}</Tag>
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: MaintenanceTicketStatus) => <TicketStatusBadge status={status} />
    },
    {
      title: t('Prestataire'),
      dataIndex: ['assignedVendor', 'name'],
      key: 'assignedVendor',
      width: 150,
      ellipsis: true,
      render: (name: string, record: Ticket) => {
        // Try multiple ways to get the vendor name
        return name || record.assignedVendor?.name || '-';
      }
    },
    {
      title: t('Date de création'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      render: (date: string | null | undefined, record: Ticket) => {
        // Try multiple approaches to format the date
        if (!date && record.createdAt) {
          date = record.createdAt;
        }
        if (!date) {
          return <span style={{ color: '#999' }}>-</span>;
        }

        // Try dayjs first (more lenient)
        const dayjsDate = dayjs(date);
        if (dayjsDate.isValid()) {
          return dayjsDate.format('DD MMM YYYY');
        }

        // Fallback to safeFormatDate
        const formatted = safeFormatDate(date, 'DD MMM YYYY', '');
        if (formatted && formatted !== 'Date invalide') {
          return formatted;
        }

        // Last resort: try to display the raw value if it exists
        return <span style={{ color: '#999' }}>-</span>;
      }
    },
    {
      title: t('Action'),
      key: 'action',
      width: 80,
      render: (_: any, record: Ticket) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/tenant/${effectiveTenantId}/admin/maintenance/tickets/${record.id}`)}
          title={t('Voir les détails')}
        />
      )
    }
  ];

  if (!loaded) {
    return (
      <>
        <Spin size="large" style={{ display: 'block', textAlign: 'center', padding: '50px' }} />
      </>
    );
  }

  return (
    <>
      <div style={{ padding: '24px' }}>
        <div className="it-toolbar" style={{ marginBottom: 24 }}>
          <Title level={2}>{t('Gestion des tickets de maintenance')}</Title>
        </div>

        <Card>
          <Table
            aria-label={t('Gestion des tickets de maintenance')}
            search={search.searchProps}
            exportFilename={t('Gestion des tickets de maintenance')}
            exportFetchAll={() =>
              collectAllPages<Ticket>(async (page, limit) => {
                const reponse = await managerMaintenanceService.listTickets(effectiveTenantId as string, {
                  ...(search.filterParams as object),
                  page,
                  limit
                });
                return { items: reponse.data ?? [], total: reponse.pagination?.total ?? 0 };
              })
            }
            columns={columns}
            dataSource={tickets}
            rowKey="id"
            pagination={search.tablePagination(total)}
            loading={loading}
            scroll={{ x: 'max-content' }}
            locale={search.isFiltered ? undefined : { emptyText: t('Aucun ticket de maintenance') }}
          />
        </Card>
      </div>
    </>
  );
};
