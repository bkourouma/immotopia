import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Card, Button, Empty, Spin, Pagination, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { TicketCard } from '../../../components/maintenance/TicketCard';
import { tenantMaintenanceService } from '../../../services/maintenance-service';
import { getProperty, listProperties } from '../../../services/property-service';
import { Ticket } from '../../../types/maintenance-types';
import { useAuth } from '../../../hooks/useAuth';
import { useListSearch } from '../../../hooks/useListSearch';
import { ListSearch, useConfirmAction } from '../../../components/primitives';
import { t } from '../../../i18n/t';
import { HelpButton, HelpSectionTitle } from '../../../help';

const { Title } = Typography;

const propertyOptionLabel = (property: { internalReference?: string; title?: string }) =>
  [property.internalReference, property.title].filter(Boolean).join(' · ');

export const TicketList: React.FC = () => {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();

  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // `loadOptions` / `resolveLabel` sont figés au premier rendu : l'agence passe par une référence.
  const tenantRef = useRef(effectiveTenantId);
  tenantRef.current = effectiveTenantId;

  // Recherche multicritères portée par l'URL (?q=…&status=DECLARED&propertyId=…&page=2).
  const search = useListSearch({
    defaultPageSize: 20,
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Titre, description, bien, prestataire…')
      },
      {
        key: 'status',
        type: 'select',
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
        key: 'propertyId',
        type: 'select',
        label: t('Bien'),
        primary: true,
        loadOptions: async term => {
          const { properties } = await listProperties(tenantRef.current as string, { q: term || undefined, limit: 20 });
          return properties.map(property => ({ value: property.id, label: propertyOptionLabel(property) }));
        },
        resolveLabel: async id => propertyOptionLabel(await getProperty(tenantRef.current as string, id))
      },
      {
        key: 'priority',
        type: 'select',
        label: t('Priorité'),
        options: [
          { value: 'LOW', label: t('Faible') },
          { value: 'MEDIUM', label: t('Moyenne') },
          { value: 'HIGH', label: t('Élevée') },
          { value: 'URGENT', label: t('Urgente') }
        ]
      },
      {
        key: 'category',
        type: 'select',
        label: t('Catégorie'),
        options: [
          { value: 'PLUMBING', label: t('Plomberie') },
          { value: 'ELECTRICITY', label: t('Électricité') },
          { value: 'AC', label: t('Climatisation') },
          { value: 'OTHER', label: t('Autre') }
        ]
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

  // Écran sur mesure (cartes + Pagination) : une page hors bornes est recadrée ici.
  useEffect(() => {
    if (loaded) search.clampPage?.(total);
  }, [total, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTickets = async () => {
    if (!effectiveTenantId) return;

    setLoading(true);
    try {
      const response = await tenantMaintenanceService.listTickets(effectiveTenantId, paramsRef.current as never);

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

  const handleEdit = (ticketId: string) => {
    navigate(`/tenant/${effectiveTenantId}/maintenance/${ticketId}/edit`);
  };

  const handleDelete = async (ticketId: string) => {
    if (!effectiveTenantId) return;

    confirmAction({
      title: t('Supprimer définitivement le ticket'),
      description: t(
        'Êtes-vous sûr de vouloir supprimer définitivement ce ticket ? Cette action est irréversible et supprimera toutes les données associées (pièces jointes, commentaires, historique).'
      ),
      okText: t('Oui, supprimer'),
      cancelText: t('Non'),
      danger: true,
      onConfirm: async () => {
        try {
          const response = await tenantMaintenanceService.deleteTicket(effectiveTenantId, ticketId);
          if (response.success) {
            message.success(t('Ticket supprimé définitivement'));
            loadTickets(); // Reload tickets list
          }
        } catch (error: any) {
          console.error('Error deleting ticket:', error);
          const errorMessage = error.response?.data?.message || t('Erreur lors de la suppression du ticket');
          message.error(errorMessage);
        }
      }
    });
  };

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
          <Title level={2}>
            <HelpSectionTitle title={t('Mes tickets de maintenance')} helpId="commercial.maintenance.liste.tickets" />
          </Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate(`/tenant/${effectiveTenantId}/maintenance/new`)}
          >
            {t('Nouveau ticket')}
          </Button>
        </div>

        <Card style={{ marginBottom: 24 }}>
          <ListSearch
            {...search.searchProps}
            aria-label={t('Rechercher dans mes tickets')}
            resultCount={total}
            extra={<HelpButton size="small" helpId="commercial.maintenance.liste.recherche" />}
          />
        </Card>

        {tickets.length === 0 && search.isFiltered ? (
          <Empty description={t('Aucun ticket ne correspond aux critères')} image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <Button onClick={search.clear}>{t('Effacer les critères')}</Button>
          </Empty>
        ) : tickets.length === 0 && !loading ? (
          <Empty description={t('Aucun ticket de maintenance')} image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate(`/tenant/${effectiveTenantId}/maintenance/new`)}
            >
              {t('Créer un ticket')}
            </Button>
          </Empty>
        ) : (
          <>
            {tickets.map(ticket => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onClick={() => navigate(`/tenant/${effectiveTenantId}/maintenance/${ticket.id}`)}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}

            {total > search.pageSize && (
              <div style={{ textAlign: 'center', marginTop: 24 }}>
                <Pagination
                  current={search.page}
                  total={total}
                  pageSize={search.pageSize}
                  showSizeChanger={false}
                  onChange={page => search.setPage(page)}
                  showTotal={count => t('Total: {{total}} tickets', { total: count })}
                />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};
