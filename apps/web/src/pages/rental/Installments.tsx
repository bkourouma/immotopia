import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  listInstallments,
  generateInstallments,
  recalculateInstallmentStatuses,
  createPayment,
  allocatePayment,
  RentalInstallment,
  RentalInstallmentStatus,
  InstallmentFilters,
  RentalPaymentMethod,
  CreatePaymentRequest,
} from '../../services/rental-service';
import { Calendar, RefreshCw, Plus, Eye, DollarSign, CreditCard, Zap } from 'lucide-react';
import { PaymentForm } from '../../components/rental/PaymentForm';
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

interface InstallmentsProps {
  leaseId?: string;
}

export const Installments: React.FC<InstallmentsProps> = ({ leaseId: propLeaseId }) => {
  const { tenantId, leaseId: paramLeaseId } = useParams<{ tenantId: string; leaseId?: string }>();
  const leaseId = propLeaseId || paramLeaseId;
  const navigate = useNavigate();
  const [installments, setInstallments] = useState<RentalInstallment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<RentalInstallment | null>(null);
  const [processingQuickPayment, setProcessingQuickPayment] = useState<string | null>(null);
  const [filters, setFilters] = useState<InstallmentFilters>({
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
      loadInstallments();
    }
  }, [tenantId, filters, leaseId]);

  const loadInstallments = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listInstallments(tenantId, {
        ...filters,
        leaseId: leaseId || filters.leaseId,
      });
      if (response.success) {
        setInstallments(response.data);
        setPagination(response.pagination);
      } else {
        setError('Erreur lors du chargement des échéances');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des échéances');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!tenantId || !leaseId) return;
    setGenerating(true);
    setError(null);
    try {
      const response = await generateInstallments(tenantId, leaseId);
      if (response.success) {
        await loadInstallments();
      } else {
        setError('Erreur lors de la génération des échéances');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la génération des échéances');
    } finally {
      setGenerating(false);
    }
  };

  const handleRecalculate = async () => {
    if (!tenantId || !leaseId) return;
    setLoading(true);
    try {
      await recalculateInstallmentStatuses(tenantId, leaseId);
      await loadInstallments();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du recalcul');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: RentalInstallmentStatus) => {
    const statusMap: Partial<Record<RentalInstallmentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }>> = {
      DUE: { label: 'Échéance', variant: 'default' },
      PARTIAL: { label: 'Partiel', variant: 'secondary' },
      PAID: { label: 'Payé', variant: 'default' },
      OVERDUE: { label: 'En retard', variant: 'destructive' },
    };
    const config = statusMap[status] || { label: status, variant: 'outline' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
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

  const calculateTotalDue = (installment: RentalInstallment) => {
    return (
      Number(installment.amount_rent || 0) +
      Number(installment.amount_service || 0) +
      Number(installment.amount_other_fees || 0) +
      Number(installment.penalty_amount || 0)
    );
  };

  const handleQuickPayment = async (installment: RentalInstallment) => {
    if (!tenantId) return;
    
    const totalDue = calculateTotalDue(installment);
    const remaining = totalDue - Number(installment.amount_paid || 0);
    
    if (remaining <= 0) {
      setError('Cette échéance est déjà payée');
      return;
    }

    setProcessingQuickPayment(installment.id);
    setError(null);
    
    try {
      // Create payment with CASH method and current date
      const paymentData: CreatePaymentRequest = {
        leaseId: installment.lease_id,
        method: RentalPaymentMethod.CASH,
        amount: remaining,
        currency: installment.currency,
        idempotencyKey: `quick-payment-${installment.id}-${Date.now()}`,
      };
      
      const paymentResponse = await createPayment(tenantId, paymentData);
      
      if (paymentResponse.success && paymentResponse.data) {
        // Allocate payment to the installment
        await allocatePayment(tenantId, paymentResponse.data.id, {
          installmentIds: [installment.id],
        });
        
        // Reload installments to show updated status
        await loadInstallments();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du paiement rapide');
    } finally {
      setProcessingQuickPayment(null);
    }
  };

  const handleOpenPaymentForm = (installment: RentalInstallment) => {
    setSelectedInstallment(installment);
    setShowPaymentForm(true);
  };

  const handleCreatePayment = async (data: CreatePaymentRequest) => {
    if (!tenantId || !selectedInstallment) return;
    
    try {
      const paymentData: CreatePaymentRequest = {
        ...data,
        leaseId: selectedInstallment.lease_id,
      };
      
      await createPayment(tenantId, paymentData);
      setShowPaymentForm(false);
      setSelectedInstallment(null);
      await loadInstallments();
    } catch (err: any) {
      throw err;
    }
  };

  // If used as standalone page (not in tab)
  const isStandalone = !propLeaseId;

  const content = (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Échéances</h1>
            <p className="text-muted-foreground">
              {leaseId ? 'Échéances du bail' : 'Gérez les échéances de location'}
            </p>
          </div>
          <div className="flex gap-2">
            {leaseId && (
              <>
                <Button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {generating ? 'Génération...' : 'Générer les échéances'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRecalculate}
                  disabled={loading}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Recalculer
                </Button>
              </>
            )}
            <Button
              variant="outline"
              onClick={() => navigate(`/tenant/${tenantId}/rental/payments`)}
              className="flex items-center gap-2"
            >
              <CreditCard className="h-4 w-4" />
              Allouer un paiement
            </Button>
          </div>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {showPaymentForm && selectedInstallment && (
          <div className="bg-white rounded-lg shadow p-6">
            <PaymentForm
              tenantId={tenantId!}
              leaseId={selectedInstallment.lease_id}
              onSubmit={handleCreatePayment}
              onCancel={() => {
                setShowPaymentForm(false);
                setSelectedInstallment(null);
              }}
            />
          </div>
        )}

        <div className="flex items-center gap-4">
          <Select
            value={filters.status || 'all'}
            onValueChange={(value) =>
              setFilters({
                ...filters,
                status: value === 'all' ? undefined : (value as RentalInstallmentStatus),
                page: 1,
              })
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="DUE">Échéance</SelectItem>
              <SelectItem value="PARTIAL">Partiel</SelectItem>
              <SelectItem value="PAID">Payé</SelectItem>
              <SelectItem value="OVERDUE">En retard</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.overdue ? 'true' : 'all'}
            onValueChange={(value) =>
              setFilters({
                ...filters,
                overdue: value === 'true',
                page: 1,
              })
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              <SelectItem value="true">En retard uniquement</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-8">Chargement...</div>
        ) : installments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {leaseId
              ? 'Aucune échéance générée. Cliquez sur "Générer les échéances" pour commencer.'
              : 'Aucune échéance trouvée'}
          </div>
        ) : (
          <>
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Période</TableHead>
                    <TableHead>Date d'échéance</TableHead>
                    <TableHead>Montant dû</TableHead>
                    <TableHead>Payé</TableHead>
                    <TableHead>Reste à payer</TableHead>
                    <TableHead>Pénalités</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installments.map((installment) => {
                    const totalDue = calculateTotalDue(installment);
                    const remaining = totalDue - Number(installment.amount_paid || 0);
                    return (
                      <TableRow key={installment.id}>
                        <TableCell>
                          {installment.period_month}/{installment.period_year}
                        </TableCell>
                        <TableCell>{formatDate(installment.due_date)}</TableCell>
                        <TableCell>
                          {formatCurrency(totalDue, installment.currency)}
                        </TableCell>
                        <TableCell>
                          {formatCurrency(installment.amount_paid, installment.currency)}
                        </TableCell>
                        <TableCell>
                          <span className={remaining > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                            {formatCurrency(remaining, installment.currency)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {installment.penalty_amount > 0
                            ? formatCurrency(installment.penalty_amount, installment.currency)
                            : '-'}
                        </TableCell>
                        <TableCell>{getStatusBadge(installment.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                navigate(`/tenant/${tenantId}/rental/installments/${installment.id}`)
                              }
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {remaining > 0 && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleQuickPayment(installment)}
                                  disabled={processingQuickPayment === installment.id}
                                  className="flex items-center gap-1"
                                >
                                  <Zap className="h-3 w-3" />
                                  {processingQuickPayment === installment.id ? '...' : 'Paiement rapide'}
                                </Button>
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => handleOpenPaymentForm(installment)}
                                  className="flex items-center gap-1"
                                >
                                  <CreditCard className="h-3 w-3" />
                                  Paiement
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Page {pagination.page} sur {pagination.totalPages} ({pagination.total} échéances)
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
