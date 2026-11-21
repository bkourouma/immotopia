import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { DataCard, DataView, PageHeader, StatusTag, type StatusTone } from '../../../components/primitives';
import { collectAllPages } from '../../../utils/table-export/collect';
import { TicketStatusBadge } from '../../../components/maintenance/TicketStatusBadge';
import { managerMaintenanceService, vendorMaintenanceService } from '../../../services/maintenance-service';
import { getProperty, listProperties } from '../../../services/property-service';
import { useListSearch } from '../../../hooks/useListSearch';
import { Ticket } from '../../../types/maintenance-types';
import { useAuth } from '../../../hooks/useAuth';
import { safeFormatDate } from '../../../utils/date-utils';
import dayjs from 'dayjs';
import { localizedList } from '../../../i18n/localized';
import { t } from '../../../i18n/t';
import { localizedRecord } from '../../../i18n/localized';

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

const priorityTones: Record<string, StatusTone> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger'
};

function formatCreatedAt(date: string | null | undefined): string {
  if (!date) return '-';
  const parsed = dayjs(date);
  if (parsed.isValid()) return parsed.format('DD MMM YYYY');
  const formatted = safeFormatDate(date, 'DD MMM YYYY', '');
  return formatted && formatted !== 'Date invalide' ? formatted : '-';
}

export const Tickets: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Premier chargement terminé : les squelettes ne remplacent plus la page ensuite
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

  const loadTickets = async () => {
    if (!effectiveTenantId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await managerMaintenanceService.listTickets(effectiveTenantId, paramsRef.current as never);
      if (response.success) {
        setTickets(response.data);
        setTotal(response.pagination?.total ?? response.data.length);
      }
    } catch (err) {
      console.error('Error loading tickets:', err);
      setError(t('Les tickets de maintenance ne se sont pas chargés. Vérifiez votre connexion puis réessayez.'));
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (effectiveTenantId) {
      loadTickets();
    }
  }, [effectiveTenantId, paramsKey]);

  const ticketPath = (record: Ticket) => `/tenant/${effectiveTenantId}/admin/maintenance/tickets/${record.id}`;

  const priorityTag = (priority: string) => (
    <StatusTag
      status={priority}
      tone={priorityTones[priority] ?? 'neutral'}
      label={priorityLabels[priority] || priority}
    />
  );

  const columns: ColumnsType<Ticket> = [
    {
      title: t('Titre'),
      dataIndex: 'title',
      key: 'title',
      width: 200,
      ellipsis: true,
      render: (text: string, record: Ticket) => (
        <Button
          type="link"
          onClick={() => navigate(ticketPath(record))}
          style={{
            padding: 0,
            textAlign: 'start',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block',
            minHeight: 44
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
      render: (priority: string) => priorityTag(priority)
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (_status: string, record: Ticket) => <TicketStatusBadge status={record.status} />
    },
    {
      title: t('Prestataire'),
      dataIndex: ['assignedVendor', 'name'],
      key: 'assignedVendor',
      width: 150,
      ellipsis: true,
      render: (name: string, record: Ticket) => name || record.assignedVendor?.name || '-'
    },
    {
      title: t('Date de création'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      render: (date: string | null | undefined) => formatCreatedAt(date)
    },
    {
      title: t('Action'),
      key: 'action',
      width: 80,
      render: (_: unknown, record: Ticket) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => navigate(ticketPath(record))}
          title={t('Voir les détails')}
          aria-label={t('Voir les détails')}
          style={{ minWidth: 44, minHeight: 44 }}
        />
      )
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader title={t('Gestion des tickets de maintenance')} />

      <Card>
        <DataView<Ticket>
          helpId="administration.maintenance-gestion.tickets.tableau"
          aria-label={t('Gestion des tickets de maintenance')}
          search={search.searchProps}
          {...search.dataViewProps}
          items={tickets}
          total={total}
          loading={!loaded}
          isReloading={loaded && loading}
          error={error}
          onRetry={() => void loadTickets()}
          rowKey={ticket => ticket.id}
          columns={columns}
          scrollX={900}
          emptyDescription={t('Aucun ticket de maintenance')}
          export={{
            filename: t('Gestion des tickets de maintenance'),
            fetchAll: () =>
              collectAllPages<Ticket>(async (page, limit) => {
                const reponse = await managerMaintenanceService.listTickets(effectiveTenantId as string, {
                  ...(search.filterParams as object),
                  page,
                  limit
                });
                return { items: reponse.data ?? [], total: reponse.pagination?.total ?? 0 };
              })
          }}
          renderCard={ticket => (
            <DataCard
              title={ticket.title}
              subtitle={ticket.property?.address || undefined}
              status={<TicketStatusBadge status={ticket.status} />}
              fields={[
                { label: t('Priorité'), value: priorityTag(ticket.priority) },
                { label: t('Catégorie'), value: categoryLabels[ticket.category] || ticket.category },
                { label: t('Prestataire'), value: ticket.assignedVendor?.name || '-' },
                { label: t('Date de création'), value: formatCreatedAt(ticket.createdAt) }
              ]}
              onOpen={() => navigate(ticketPath(ticket))}
              aria-label={ticket.title}
            />
          )}
        />
      </Card>
    </div>
  );
};
