import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { Button } from '../../components/ui/button';
import { getLease, RentalLease, RentalLeaseStatus } from '../../services/rental-service';
import { Badge } from '../../components/ui/badge';
import { Edit, ArrowLeft, FileText, Calendar, Building2, User, DollarSign, CreditCard, Shield, FileText as FileTextIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Installments } from './Installments';
import { Payments } from './Payments';
import { Penalties } from './Penalties';
import { Deposits } from './Deposits';
import { Documents } from './Documents';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { updateLeaseStatus } from '../../services/rental-service';

export const LeaseDetailPage: React.FC = () => {
  const { tenantId, leaseId } = useParams<{ tenantId: string; leaseId: string }>();
  const navigate = useNavigate();
  const [lease, setLease] = useState<RentalLease | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tenantId && leaseId) {
      loadLease();
    }
  }, [tenantId, leaseId]);

  const loadLease = async () => {
    if (!tenantId || !leaseId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getLease(tenantId, leaseId);
      if (response.success) {
        setLease(response.data);
      } else {
        setError('Erreur lors du chargement du bail');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement du bail');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: RentalLeaseStatus) => {
    if (!tenantId || !leaseId) return;
    try {
      await updateLeaseStatus(tenantId, leaseId, newStatus);
      loadLease();
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

  if (loading) {
    return (
      <DashboardLayout>
        <div className="text-center py-8">Chargement...</div>
      </DashboardLayout>
    );
  }

  if (error || !lease) {
    return (
      <DashboardLayout>
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
          {error || 'Bail non trouvé'}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/tenant/${tenantId}/rental/leases`)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Bail {lease.lease_number}</h1>
              <p className="text-muted-foreground">Détails du bail de location</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={lease.status}
              onValueChange={(value) => handleStatusChange(value as RentalLeaseStatus)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Brouillon</SelectItem>
                <SelectItem value="ACTIVE">Actif</SelectItem>
                <SelectItem value="SUSPENDED">Suspendu</SelectItem>
                <SelectItem value="ENDED">Terminé</SelectItem>
                <SelectItem value="CANCELED">Annulé</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => navigate(`/tenant/${tenantId}/rental/leases/${leaseId}/edit`)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Modifier
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Informations générales
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Numéro de bail</dt>
                <dd className="mt-1 text-sm text-gray-900">{lease.lease_number}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Statut</dt>
                <dd className="mt-1">{getStatusBadge(lease.status)}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Propriété</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {lease.property?.internalReference || '-'}
                  {lease.property?.address && ` - ${lease.property.address}`}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Locataire principal</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {lease.primaryRenter?.crmContactId ? (
                    <button
                      onClick={() => navigate(`/tenant/${tenantId}/crm/contacts/${lease.primaryRenter?.crmContactId}/edit`)}
                      className="text-blue-600 hover:text-blue-800 hover:underline font-medium transition-colors"
                    >
                      {lease.primaryRenter?.user?.fullName || lease.primaryRenter?.userId || '-'}
                    </button>
                  ) : (
                    <span>{lease.primaryRenter?.user?.fullName || lease.primaryRenter?.userId || '-'}</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Dates
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Date de début</dt>
                <dd className="mt-1 text-sm text-gray-900">{formatDate(lease.start_date)}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Date de fin</dt>
                <dd className="mt-1 text-sm text-gray-900">{formatDate(lease.end_date)}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Date d'emménagement</dt>
                <dd className="mt-1 text-sm text-gray-900">{formatDate(lease.move_in_date)}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Date de déménagement</dt>
                <dd className="mt-1 text-sm text-gray-900">{formatDate(lease.move_out_date)}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Financier
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Loyer</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatCurrency(lease.rent_amount, lease.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Charges de service</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatCurrency(lease.service_charge_amount, lease.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Dépôt de garantie</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatCurrency(lease.security_deposit_amount, lease.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Fréquence de facturation</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {lease.billing_frequency === 'MONTHLY' && 'Mensuel'}
                  {lease.billing_frequency === 'QUARTERLY' && 'Trimestriel'}
                  {lease.billing_frequency === 'SEMIANNUAL' && 'Semestriel'}
                  {lease.billing_frequency === 'ANNUAL' && 'Annuel'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Jour d'échéance</dt>
                <dd className="mt-1 text-sm text-gray-900">Le {lease.due_day_of_month} de chaque mois</dd>
              </div>
            </dl>
          </div>

          {lease.notes && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Notes</h2>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{lease.notes}</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow">
          <Tabs defaultValue="installments" className="w-full">
            <TabsList className="w-full justify-start border-b">
              <TabsTrigger value="installments" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Échéances
              </TabsTrigger>
              <TabsTrigger value="payments" className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Paiements
              </TabsTrigger>
              <TabsTrigger value="penalties" className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Pénalités
              </TabsTrigger>
              <TabsTrigger value="deposit" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Dépôt de garantie
              </TabsTrigger>
              <TabsTrigger value="documents" className="flex items-center gap-2">
                <FileTextIcon className="h-4 w-4" />
                Documents
              </TabsTrigger>
            </TabsList>
            <TabsContent value="installments" className="p-6">
              <Installments leaseId={leaseId} />
            </TabsContent>
            <TabsContent value="payments" className="p-6">
              <Payments leaseId={leaseId} />
            </TabsContent>
            <TabsContent value="penalties" className="p-6">
              <Penalties leaseId={leaseId} />
            </TabsContent>
            <TabsContent value="deposit" className="p-6">
              <Deposits leaseId={leaseId} />
            </TabsContent>
            <TabsContent value="documents" className="p-6">
              <Documents leaseId={leaseId} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
};

