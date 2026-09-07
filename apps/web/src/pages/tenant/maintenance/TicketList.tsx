import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Select, Button, Empty, Spin, Pagination, Space, Typography, message, Modal } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { DashboardLayout } from '../../../components/dashboard/dashboard-layout';
import { TicketCard } from '../../../components/maintenance/TicketCard';
import { tenantMaintenanceService } from '../../../services/maintenance-service';
import { Ticket, MaintenanceTicketStatus } from '../../../types/maintenance-types';
import { useAuth } from '../../../hooks/useAuth';

const { Title } = Typography;
const { Option } = Select;

export const TicketList: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<MaintenanceTicketStatus | undefined>(undefined);
  const [propertyFilter, setPropertyFilter] = useState<string | undefined>(undefined);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  useEffect(() => {
    if (effectiveTenantId) {
      loadTickets();
    }
  }, [effectiveTenantId, statusFilter, propertyFilter, pagination.page]);

  const loadTickets = async () => {
    if (!effectiveTenantId) return;

    setLoading(true);
    try {
      const response = await tenantMaintenanceService.listTickets(effectiveTenantId, {
        status: statusFilter,
        propertyId: propertyFilter,
        page: pagination.page,
        limit: pagination.limit
      });

      if (response.success) {
        setTickets(response.data);
        setPagination(response.pagination);
      }
    } catch (error) {
      console.error('Error loading tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusFilterChange = (value: MaintenanceTicketStatus | undefined) => {
    setStatusFilter(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handlePropertyFilterChange = (value: string | undefined) => {
    setPropertyFilter(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  };

  const handleEdit = (ticketId: string) => {
    navigate(`/tenant/${effectiveTenantId}/maintenance/${ticketId}/edit`);
  };

  const handleDelete = async (ticketId: string) => {
    if (!effectiveTenantId) return;

    Modal.confirm({
      title: 'Supprimer définitivement le ticket',
      content: 'Êtes-vous sûr de vouloir supprimer définitivement ce ticket ? Cette action est irréversible et supprimera toutes les données associées (pièces jointes, commentaires, historique).',
      okText: 'Oui, supprimer',
      cancelText: 'Non',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const response = await tenantMaintenanceService.deleteTicket(effectiveTenantId, ticketId);
          if (response.success) {
            message.success('Ticket supprimé définitivement');
            loadTickets(); // Reload tickets list
          }
        } catch (error: any) {
          console.error('Error deleting ticket:', error);
          const errorMessage = error.response?.data?.message || 'Erreur lors de la suppression du ticket';
          message.error(errorMessage);
        }
      }
    });
  };

  if (loading && tickets.length === 0) {
    return (
      <DashboardLayout>
        <Spin size="large" style={{ display: 'block', textAlign: 'center', padding: '50px' }} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Title level={2}>Mes tickets de maintenance</Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate(`/tenant/${effectiveTenantId}/maintenance/new`)}
          >
            Nouveau ticket
          </Button>
        </div>

        <Card style={{ marginBottom: 24 }}>
          <Space>
            <Select
              placeholder="Filtrer par statut"
              allowClear
              style={{ width: 200 }}
              value={statusFilter}
              onChange={handleStatusFilterChange}
            >
              <Option value="DECLARED">Déclaré</Option>
              <Option value="IN_PROGRESS">En cours</Option>
              <Option value="ASSIGNED">Assigné</Option>
              <Option value="RESOLVED">Résolu</Option>
              <Option value="CANCELED">Annulé</Option>
            </Select>

            <Select
              placeholder="Filtrer par propriété"
              allowClear
              style={{ width: 200 }}
              value={propertyFilter}
              onChange={handlePropertyFilterChange}
            >
              {/* TODO: Load properties and populate options */}
            </Select>
          </Space>
        </Card>

        {tickets.length === 0 ? (
          <Empty
            description="Aucun ticket de maintenance"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate(`/tenant/${effectiveTenantId}/maintenance/new`)}
            >
              Créer un ticket
            </Button>
          </Empty>
        ) : (
          <>
            {tickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onClick={() => navigate(`/tenant/${effectiveTenantId}/maintenance/${ticket.id}`)}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}

            {pagination.totalPages > 1 && (
              <div style={{ textAlign: 'center', marginTop: 24 }}>
                <Pagination
                  current={pagination.page}
                  total={pagination.total}
                  pageSize={pagination.limit}
                  onChange={handlePageChange}
                  showTotal={(total) => `Total: ${total} tickets`}
                />
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};
