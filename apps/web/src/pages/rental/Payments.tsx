import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { Button } from '../../components/ui/button';
import {
  listPayments,
  createPayment,
  allocatePayment,
  updatePaymentStatus,
  RentalPayment,
  RentalPaymentStatus,
  RentalPaymentMethod,
  PaymentFilters,
  CreatePaymentRequest,
  AllocatePaymentRequest,
} from '../../services/rental-service';
import { Plus, Eye, DollarSign, CreditCard, CheckCircle, XCircle } from 'lucide-react';
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
import { PaymentForm } from '../../components/rental/PaymentForm';
import { AllocatePaymentForm } from '../../components/rental/AllocatePaymentForm';

interface PaymentsProps {
  leaseId?: string;
}

export const Payments: React.FC<PaymentsProps> = ({ leaseId: propLeaseId }) => {
  const { tenantId, leaseId: paramLeaseId } = useParams<{ tenantId: string; leaseId?: string }>();
  const leaseId = propLeaseId || paramLeaseId;
  const navigate = useNavigate();
  const [payments, setPayments] = useState<RentalPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showAllocateForm, setShowAllocateForm] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<RentalPayment | null>(null);
  const [filters, setFilters] = useState<PaymentFilters>({
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
      loadPayments();
    }
  }, [tenantId, filters, leaseId]);

  const loadPayments = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listPayments(tenantId, {
        ...filters,
        leaseId: leaseId || filters.leaseId,
      });
      if (response.success) {
        setPayments(response.data);
        setPagination(response.pagination);
      } else {
        setError('Erreur lors du chargement des paiements');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des paiements');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePayment = async (data: CreatePaymentRequest) => {
    if (!tenantId) return;
    try {
      await createPayment(tenantId, data);
      setShowPaymentForm(false);
      await loadPayments();
    } catch (err: any) {
      throw err;
    }
  };

  const handleAllocate = (payment: RentalPayment) => {
    setSelectedPayment(payment);
    setShowAllocateForm(true);
  };

  const handleAllocatePayment = async (data: AllocatePaymentRequest) => {
    if (!tenantId || !selectedPayment) return;
    try {
      await allocatePayment(tenantId, selectedPayment.id, data);
      setShowAllocateForm(false);
      setSelectedPayment(null);
      // Redirect to installments page after successful allocation
      navigate(`/tenant/${tenantId}/rental/installments`);
    } catch (err: any) {
      throw err;
    }
  };

  const handleStatusChange = async (paymentId: string, newStatus: RentalPaymentStatus) => {
    if (!tenantId) return;
    try {
      await updatePaymentStatus(tenantId, paymentId, newStatus);
      await loadPayments();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour du statut');
    }
  };

  const getStatusBadge = (status: RentalPaymentStatus) => {
    const statusMap: Record<RentalPaymentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      PENDING: { label: 'En attente', variant: 'outline' },
      SUCCESS: { label: 'Réussi', variant: 'default' },
      FAILED: { label: 'Échoué', variant: 'destructive' },
      CANCELED: { label: 'Annulé', variant: 'secondary' },
      REFUNDED: { label: 'Remboursé', variant: 'secondary' },
      PARTIALLY_REFUNDED: { label: 'Partiellement remboursé', variant: 'secondary' },
    };
    const config = statusMap[status] || { label: status, variant: 'outline' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getMethodLabel = (method: RentalPaymentMethod) => {
    const methodMap: Record<RentalPaymentMethod, string> = {
      CASH: 'Espèces',
      BANK_TRANSFER: 'Virement bancaire',
      CHECK: 'Chèque',
      MOBILE_MONEY: 'Mobile Money',
      CARD: 'Carte bancaire',
      OTHER: 'Autre',
    };
    return methodMap[method] || method;
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
            <h1 className="text-3xl font-bold">Paiements</h1>
            <p className="text-muted-foreground">Gérez les paiements de location</p>
          </div>
          <Button
            onClick={() => setShowPaymentForm(true)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Nouveau paiement
          </Button>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {showPaymentForm && (
          <div className="bg-white rounded-lg shadow p-6">
            <PaymentForm
              tenantId={tenantId!}
              leaseId={leaseId}
              onSubmit={handleCreatePayment}
              onCancel={() => setShowPaymentForm(false)}
            />
          </div>
        )}

        {showAllocateForm && selectedPayment && (
          <div className="bg-white rounded-lg shadow p-6">
            <AllocatePaymentForm
              tenantId={tenantId!}
              payment={selectedPayment}
              onSubmit={handleAllocatePayment}
              onCancel={() => {
                setShowAllocateForm(false);
                setSelectedPayment(null);
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
                status: value === 'all' ? undefined : (value as RentalPaymentStatus),
                page: 1,
              })
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="PENDING">En attente</SelectItem>
              <SelectItem value="SUCCESS">Réussi</SelectItem>
              <SelectItem value="FAILED">Échoué</SelectItem>
              <SelectItem value="CANCELED">Annulé</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-8">Chargement...</div>
        ) : payments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Aucun paiement trouvé
          </div>
        ) : (
          <>
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Alloué</TableHead>
                    <TableHead>Restant</TableHead>
                    <TableHead>Méthode</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => {
                    const allocatedAmount = payment.allocations?.reduce(
                      (sum, alloc) => sum + Number(alloc.amount || 0),
                      0
                    ) || 0;
                    const remainingAmount = payment.amount - allocatedAmount;
                    return (
                    <TableRow key={payment.id}>
                      <TableCell>{formatDate(payment.initiated_at)}</TableCell>
                      <TableCell>
                        {formatCurrency(payment.amount, payment.currency)}
                      </TableCell>
                      <TableCell>
                        <span className={allocatedAmount > 0 ? 'text-green-600 font-semibold' : 'text-gray-500'}>
                          {formatCurrency(allocatedAmount, payment.currency)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={remainingAmount > 0 ? 'text-orange-600 font-semibold' : 'text-gray-500'}>
                          {formatCurrency(remainingAmount, payment.currency)}
                        </span>
                      </TableCell>
                      <TableCell>{getMethodLabel(payment.method)}</TableCell>
                      <TableCell>{getStatusBadge(payment.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              navigate(`/tenant/${tenantId}/rental/payments/${payment.id}`)
                            }
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {payment.status === 'PENDING' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAllocate(payment)}
                            >
                              Allouer
                            </Button>
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
                  Page {pagination.page} sur {pagination.totalPages} ({pagination.total} paiements)
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
