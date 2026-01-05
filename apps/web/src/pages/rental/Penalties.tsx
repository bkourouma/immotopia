import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { Button } from '../../components/ui/button';
import {
  listPenalties,
  calculatePenalties,
  updatePenalty,
  RentalPenalty,
  PenaltyFilters,
} from '../../services/rental-service';
import { RefreshCw, DollarSign, AlertTriangle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';

interface PenaltiesProps {
  leaseId?: string;
}

export const Penalties: React.FC<PenaltiesProps> = ({ leaseId: propLeaseId }) => {
  const { tenantId, leaseId: paramLeaseId } = useParams<{ tenantId: string; leaseId?: string }>();
  const leaseId = propLeaseId || paramLeaseId;
  const [penalties, setPenalties] = useState<RentalPenalty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [filters, setFilters] = useState<PenaltyFilters>({
    leaseId: leaseId,
    page: 1,
    limit: 50,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });

  useEffect(() => {
    if (tenantId) {
      loadPenalties();
    }
  }, [tenantId, filters, leaseId]);

  const loadPenalties = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listPenalties(tenantId, {
        ...filters,
        leaseId: leaseId || filters.leaseId,
      });
      if (response.success) {
        setPenalties(response.data);
        setPagination(response.pagination);
      } else {
        setError('Erreur lors du chargement des pénalités');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des pénalités');
    } finally {
      setLoading(false);
    }
  };

  const handleCalculate = async () => {
    if (!tenantId || !leaseId) return;
    setCalculating(true);
    setError(null);
    try {
      const response = await calculatePenalties(tenantId);
      if (response.success) {
        await loadPenalties();
      } else {
        setError('Erreur lors du calcul des pénalités');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du calcul des pénalités');
    } finally {
      setCalculating(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  const formatCurrency = (amount: number, currency: string = 'FCFA') => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency === 'FCFA' ? 'XOF' : currency,
    }).format(amount);
  };

  // If used as standalone page (not in tab)
  const isStandalone = !propLeaseId;

  const content = (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Pénalités</h1>
            <p className="text-muted-foreground">
              {leaseId ? 'Pénalités du bail' : 'Gérez les pénalités de retard'}
            </p>
          </div>
          {leaseId && (
            <Button
              onClick={handleCalculate}
              disabled={calculating}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              {calculating ? 'Calcul en cours...' : 'Calculer les pénalités'}
            </Button>
          )}
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">Chargement...</div>
        ) : penalties.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {leaseId
              ? 'Aucune pénalité calculée. Cliquez sur "Calculer les pénalités" pour commencer.'
              : 'Aucune pénalité trouvée'}
          </div>
        ) : (
          <>
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date de calcul</TableHead>
                    <TableHead>Jours de retard</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Montant ajusté</TableHead>
                    <TableHead>Raison d'ajustement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {penalties.map((penalty) => (
                    <TableRow key={penalty.id}>
                      <TableCell>{formatDate(penalty.calculated_at)}</TableCell>
                      <TableCell>
                        <Badge variant="destructive">{penalty.days_late} jours</Badge>
                      </TableCell>
                      <TableCell>
                        {formatCurrency(penalty.amount, penalty.currency)}
                      </TableCell>
                      <TableCell>
                        {penalty.adjusted_amount
                          ? formatCurrency(penalty.adjusted_amount, penalty.currency)
                          : '-'}
                      </TableCell>
                      <TableCell>
                        {penalty.adjustment_reason || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Page {pagination.page} sur {pagination.totalPages} ({pagination.total} pénalités)
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
    </>
  );

  if (isStandalone) {
    return <DashboardLayout>{content}</DashboardLayout>;
  }

  return content;
};

