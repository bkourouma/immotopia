import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { Button } from '../../components/ui/button';
import {
  getDeposit,
  createDeposit,
  createDepositMovement,
  listDepositMovements,
  RentalSecurityDeposit,
  RentalDepositMovement,
  CreateDepositMovementRequest,
  RentalDepositMovementType,
} from '../../services/rental-service';
import { Plus, Shield, ArrowUpCircle, ArrowDownCircle, RefreshCw } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { DepositMovementForm } from '../../components/rental/DepositMovementForm';

interface DepositsProps {
  leaseId?: string;
}

export const Deposits: React.FC<DepositsProps> = ({ leaseId: propLeaseId }) => {
  const { tenantId, leaseId: paramLeaseId } = useParams<{ tenantId: string; leaseId?: string }>();
  const leaseId = propLeaseId || paramLeaseId;
  const [deposit, setDeposit] = useState<RentalSecurityDeposit | null>(null);
  const [movements, setMovements] = useState<RentalDepositMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMovementForm, setShowMovementForm] = useState(false);

  useEffect(() => {
    if (tenantId && leaseId) {
      loadDeposit();
      loadMovements();
    }
  }, [tenantId, leaseId]);

  const loadDeposit = async () => {
    if (!tenantId || !leaseId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getDeposit(tenantId, leaseId);
      if (response.success) {
        setDeposit(response.data);
      } else {
        // Try to create deposit if it doesn't exist
        const leaseResponse = await fetch(`/api/tenants/${tenantId}/rental/leases/${leaseId}`);
        if (leaseResponse.ok) {
          const lease = await leaseResponse.json();
          if (lease.data?.security_deposit_amount > 0) {
            // Deposit will be created automatically when needed
          }
        }
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        // Deposit doesn't exist yet, that's okay
        setDeposit(null);
      } else {
        setError(err.response?.data?.message || 'Erreur lors du chargement du dépôt');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMovements = async () => {
    if (!tenantId || !deposit?.id) return;
    try {
      const response = await listDepositMovements(tenantId, deposit.id);
      if (response.success) {
        setMovements(response.data);
      }
    } catch (err: any) {
      console.error('Error loading movements:', err);
    }
  };

  useEffect(() => {
    if (deposit?.id) {
      loadMovements();
    }
  }, [deposit?.id]);

  const handleCreateMovement = async (data: CreateDepositMovementRequest) => {
    if (!tenantId || !deposit) return;
    try {
      await createDepositMovement(tenantId, deposit.id, data);
      setShowMovementForm(false);
      await loadDeposit();
      await loadMovements();
    } catch (err: any) {
      throw err;
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

  const getMovementTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      COLLECT: 'Collecte',
      HOLD: 'Blocage',
      RELEASE: 'Libération',
      REFUND: 'Remboursement',
      FORFEIT: 'Confiscation',
      ADJUSTMENT: 'Ajustement',
    };
    return typeMap[type] || type;
  };

  const getMovementTypeIcon = (type: string) => {
    if (type === 'COLLECT' || type === 'ADJUSTMENT') {
      return <ArrowUpCircle className="h-4 w-4 text-green-600" />;
    }
    if (type === 'RELEASE' || type === 'REFUND' || type === 'FORFEIT') {
      return <ArrowDownCircle className="h-4 w-4 text-red-600" />;
    }
    return <Shield className="h-4 w-4 text-blue-600" />;
  };

  // If used as standalone page (not in tab)
  const isStandalone = !propLeaseId;

  if (loading) {
    const loadingContent = <div className="text-center py-8">Chargement...</div>;
    if (isStandalone) {
      return <DashboardLayout>{loadingContent}</DashboardLayout>;
    }
    return loadingContent;
  }

  const content = (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dépôt de garantie</h1>
            <p className="text-muted-foreground">Gérez le dépôt de garantie du bail</p>
          </div>
          {deposit && (
            <Button
              onClick={() => setShowMovementForm(true)}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Nouveau mouvement
            </Button>
          )}
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {deposit ? (
          <>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Montant cible</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(deposit.target_amount, deposit.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Solde actuel</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(deposit.current_balance, deposit.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Statut</p>
                  <Badge
                    variant={
                      deposit.current_balance >= deposit.target_amount ? 'default' : 'outline'
                    }
                  >
                    {deposit.current_balance >= deposit.target_amount
                      ? 'Complet'
                      : 'En attente'}
                  </Badge>
                </div>
              </div>
            </div>

            {showMovementForm && (
              <div className="bg-white rounded-lg shadow p-6">
                <DepositMovementForm
                  tenantId={tenantId!}
                  deposit={deposit}
                  onSubmit={handleCreateMovement}
                  onCancel={() => setShowMovementForm(false)}
                />
              </div>
            )}

            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <h2 className="text-xl font-semibold">Historique des mouvements</h2>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Aucun mouvement enregistré
                      </TableCell>
                    </TableRow>
                  ) : (
                    movements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell>{formatDate(movement.created_at)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getMovementTypeIcon(movement.type)}
                            {getMovementTypeLabel(movement.type)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={
                              movement.type === 'COLLECT' || movement.type === 'ADJUSTMENT'
                                ? 'text-green-600 font-semibold'
                                : 'text-red-600 font-semibold'
                            }
                          >
                            {movement.type === 'COLLECT' || movement.type === 'ADJUSTMENT' ? '+' : '-'}
                            {formatCurrency(movement.amount, movement.currency)}
                          </span>
                        </TableCell>
                        <TableCell>{movement.note || '-'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Aucun dépôt de garantie configuré pour ce bail
          </div>
        )}
      </div>
    </>
  );

  if (isStandalone) {
    return <DashboardLayout>{content}</DashboardLayout>;
  }

  return content;
};

