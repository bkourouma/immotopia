import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  listLeases,
  getLease,
  updateLeaseStatus,
  RentalLease,
  RentalLeaseStatus,
  LeaseFilters,
} from '../../services/rental-service';
import { Plus, Search, Edit, Eye, FileText, Calendar, Building2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';

export const Leases: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [leases, setLeases] = useState<RentalLease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<LeaseFilters>({
    page: 1,
    limit: 20,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (tenantId) {
      loadLeases();
    }
  }, [tenantId, filters, searchTerm]);

  const loadLeases = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listLeases(tenantId, {
        ...filters,
        search: searchTerm || undefined,
      });
      if (response.success) {
        setLeases(response.data);
        setPagination(response.pagination);
      } else {
        setError('Erreur lors du chargement des baux');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des baux');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (leaseId: string, newStatus: RentalLeaseStatus) => {
    if (!tenantId) return;
    try {
      await updateLeaseStatus(tenantId, leaseId, newStatus);
      loadLeases();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour du statut');
    }
  };

  const getStatusBadge = (status: RentalLeaseStatus) => {
    const statusMap: Record<RentalLeaseStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      DRAFT: { label: 'Brouillon', variant: 'outline' },
      ACTIVE: { label: 'Actif', variant: 'default' },
      SUSPENDED: { label: 'Suspendu', variant: 'secondary' },
      ENDED: { label: 'Terminé', variant: 'secondary' },
      CANCELED: { label: 'Annulé', variant: 'destructive' },
    };
    const config = statusMap[status] || { label: status, variant: 'outline' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  const formatCurrency = (amount: number, currency: string = 'FCFA') => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency === 'FCFA' ? 'XOF' : currency,
    }).format(amount);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Gestion Locative</h1>
            <p className="text-muted-foreground">Gérez les baux et locations</p>
          </div>
          <Button
            onClick={() => navigate(`/tenant/${tenantId}/rental/leases/new`)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Nouveau bail
          </Button>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par numéro de bail..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setFilters({ ...filters, page: 1 });
              }}
              className="pl-10"
            />
          </div>
          <Select
            value={filters.status || 'all'}
            onValueChange={(value) =>
              setFilters({
                ...filters,
                status: value === 'all' ? undefined : (value as RentalLeaseStatus),
                page: 1,
              })
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="DRAFT">Brouillon</SelectItem>
              <SelectItem value="ACTIVE">Actif</SelectItem>
              <SelectItem value="SUSPENDED">Suspendu</SelectItem>
              <SelectItem value="ENDED">Terminé</SelectItem>
              <SelectItem value="CANCELED">Annulé</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-8">Chargement...</div>
        ) : leases.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Aucun bail trouvé
          </div>
        ) : (
          <>
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Propriété</TableHead>
                    <TableHead>Locataire</TableHead>
                    <TableHead>Date début</TableHead>
                    <TableHead>Date fin</TableHead>
                    <TableHead>Loyer</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leases.map((lease) => (
                    <TableRow key={lease.id}>
                      <TableCell className="font-medium">
                        {lease.lease_number}
                      </TableCell>
                      <TableCell>
                        {lease.property?.internalReference || '-'}
                      </TableCell>
                      <TableCell>
                        {lease.primaryRenter?.user?.fullName || lease.primaryRenter?.userId || '-'}
                      </TableCell>
                      <TableCell>{formatDate(lease.start_date)}</TableCell>
                      <TableCell>{formatDate(lease.end_date)}</TableCell>
                      <TableCell>
                        {formatCurrency(lease.rent_amount, lease.currency)}
                      </TableCell>
                      <TableCell>{getStatusBadge(lease.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              navigate(`/tenant/${tenantId}/rental/leases/${lease.id}`)
                            }
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              navigate(`/tenant/${tenantId}/rental/leases/${lease.id}/edit`)
                            }
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Page {pagination.page} sur {pagination.totalPages} ({pagination.total} baux)
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page === 1}
                    onClick={() => setFilters({ ...filters, page: pagination.page - 1 })}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page === pagination.totalPages}
                    onClick={() => setFilters({ ...filters, page: pagination.page + 1 })}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};


