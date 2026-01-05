import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { Button } from '../../components/ui/button';
import { getInstallment, RentalInstallment, RentalInstallmentStatus } from '../../services/rental-service';
import { Badge } from '../../components/ui/badge';
import { ArrowLeft, DollarSign, Calendar, FileText } from 'lucide-react';

export const InstallmentDetailPage: React.FC = () => {
  const { tenantId, installmentId } = useParams<{ tenantId: string; installmentId: string }>();
  const navigate = useNavigate();
  const [installment, setInstallment] = useState<RentalInstallment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tenantId && installmentId) {
      loadInstallment();
    }
  }, [tenantId, installmentId]);

  const loadInstallment = async () => {
    if (!tenantId || !installmentId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getInstallment(tenantId, installmentId);
      if (response.success) {
        setInstallment(response.data);
      } else {
        setError('Erreur lors du chargement de l\'échéance');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement de l\'échéance');
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

  const calculateTotalDue = (inst: RentalInstallment) => {
    return (
      Number(inst.amount_rent || 0) +
      Number(inst.amount_service || 0) +
      Number(inst.amount_other_fees || 0) +
      Number(inst.penalty_amount || 0)
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="text-center py-8">Chargement...</div>
      </DashboardLayout>
    );
  }

  if (error || !installment) {
    return (
      <DashboardLayout>
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
          {error || 'Échéance non trouvée'}
        </div>
      </DashboardLayout>
    );
  }

  const totalDue = calculateTotalDue(installment);
  const remaining = totalDue - Number(installment.amount_paid || 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/tenant/${tenantId}/rental/leases/${installment.lease_id}`)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
            <div>
              <h1 className="text-3xl font-bold">
                Échéance {installment.period_month}/{installment.period_year}
              </h1>
              <p className="text-muted-foreground">Détails de l'échéance</p>
            </div>
          </div>
          {getStatusBadge(installment.status)}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Informations financières
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Loyer</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatCurrency(installment.amount_rent, installment.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Charges de service</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatCurrency(installment.amount_service, installment.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Autres frais</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatCurrency(installment.amount_other_fees, installment.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Pénalités</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatCurrency(installment.penalty_amount, installment.currency)}
                </dd>
              </div>
              <div className="pt-2 border-t">
                <dt className="text-sm font-medium text-gray-700">Total dû</dt>
                <dd className="mt-1 text-lg font-semibold text-gray-900">
                  {formatCurrency(totalDue, installment.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Montant payé</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatCurrency(installment.amount_paid, installment.currency)}
                </dd>
              </div>
              <div className="pt-2 border-t">
                <dt className="text-sm font-medium text-gray-700">Reste à payer</dt>
                <dd className={`mt-1 text-lg font-semibold ${remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(remaining, installment.currency)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Informations
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Période</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {installment.period_month}/{installment.period_year}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Date d'échéance</dt>
                <dd className="mt-1 text-sm text-gray-900">{formatDate(installment.due_date)}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Statut</dt>
                <dd className="mt-1">{getStatusBadge(installment.status)}</dd>
              </div>
              {installment.paid_at && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Date de paiement</dt>
                  <dd className="mt-1 text-sm text-gray-900">{formatDate(installment.paid_at)}</dd>
                </div>
              )}
              <div>
                <dt className="text-sm font-medium text-gray-500">Devise</dt>
                <dd className="mt-1 text-sm text-gray-900">{installment.currency}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Date de création</dt>
                <dd className="mt-1 text-sm text-gray-900">{formatDate(installment.created_at)}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Dernière mise à jour</dt>
                <dd className="mt-1 text-sm text-gray-900">{formatDate(installment.updated_at)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};
