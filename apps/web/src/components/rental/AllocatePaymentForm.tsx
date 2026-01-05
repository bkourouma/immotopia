import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import {
  AllocatePaymentRequest,
  RentalPayment,
  listInstallments,
  RentalInstallment,
  RentalInstallmentStatus,
} from '../../services/rental-service';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { formatNumberWithSpaces, parseFormattedNumber } from '../../lib/utils';

interface AllocatePaymentFormProps {
  tenantId: string;
  payment: RentalPayment;
  onSubmit: (data: AllocatePaymentRequest) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

export const AllocatePaymentForm: React.FC<AllocatePaymentFormProps> = ({
  tenantId,
  payment,
  onSubmit,
  onCancel,
  loading = false,
}) => {
  const [installments, setInstallments] = useState<RentalInstallment[]>([]);
  const [loadingInstallments, setLoadingInstallments] = useState(true);
  const [selectedInstallments, setSelectedInstallments] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (payment.lease_id) {
      loadInstallments();
    }
  }, [payment.lease_id, tenantId]);

  const loadInstallments = async () => {
    if (!tenantId || !payment.lease_id) return;
    setLoadingInstallments(true);
    try {
      // Load all installments (not just overdue) - we'll filter out fully paid ones client-side
      const response = await listInstallments(tenantId, {
        leaseId: payment.lease_id,
        page: 1,
        limit: 100,
      });
      if (response.success) {
        // Filter to show only installments that are not fully paid
        const unpaidInstallments = response.data.filter((inst) => {
          const totalDue =
            Number(inst.amount_rent || 0) +
            Number(inst.amount_service || 0) +
            Number(inst.amount_other_fees || 0) +
            Number(inst.penalty_amount || 0);
          const remaining = totalDue - Number(inst.amount_paid || 0);
          return remaining > 0;
        });
        setInstallments(unpaidInstallments);
      }
    } catch (error) {
      console.error('Error loading installments:', error);
    } finally {
      setLoadingInstallments(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const installmentIds = Object.keys(selectedInstallments).filter(
      (id) => selectedInstallments[id]
    );

    if (installmentIds.length === 0) {
      setErrors({ submit: 'Sélectionnez au moins une échéance' });
      return;
    }

    setIsSubmitting(true);
    try {
      const submitData: AllocatePaymentRequest = {
        installmentIds,
        amounts: Object.keys(amounts).reduce((acc, id) => {
          const parsedAmount = parseFormattedNumber(amounts[id]);
          if (parsedAmount && parseFloat(parsedAmount) > 0) {
            acc[id] = parseFloat(parsedAmount);
          }
          return acc;
        }, {} as Record<string, number>),
      };

      await onSubmit(submitData);
    } catch (error: any) {
      if (error.response?.data?.message) {
        setErrors({ submit: error.response.data.message });
      } else {
        setErrors({ submit: 'Une erreur est survenue lors de l\'allocation' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleInstallment = (installmentId: string) => {
    setSelectedInstallments((prev) => ({
      ...prev,
      [installmentId]: !prev[installmentId],
    }));
  };

  const calculateRemainingDue = (installment: RentalInstallment) => {
    const totalDue =
      Number(installment.amount_rent || 0) +
      Number(installment.amount_service || 0) +
      Number(installment.amount_other_fees || 0) +
      Number(installment.penalty_amount || 0);
    return totalDue - Number(installment.amount_paid || 0);
  };

  const formatCurrency = (amount: number, currency: string = 'FCFA') => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency === 'FCFA' ? 'XOF' : currency,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  // Calculate available amount (payment amount minus existing allocations)
  const allocatedAmount = payment.allocations?.reduce(
    (sum, alloc) => sum + Number(alloc.amount || 0),
    0
  ) || 0;
  const availableAmount = payment.amount - allocatedAmount;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Allouer le paiement</h3>
        <div className="text-sm text-muted-foreground mb-4 space-y-1">
          <p>
            Montant total: {formatCurrency(payment.amount, payment.currency)}
          </p>
          {allocatedAmount > 0 && (
            <p>
              Déjà alloué: {formatCurrency(allocatedAmount, payment.currency)}
            </p>
          )}
          <p className="font-semibold text-foreground">
            Montant disponible: {formatCurrency(availableAmount, payment.currency)}
          </p>
        </div>
      </div>

      {errors.submit && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
          {errors.submit}
        </div>
      )}

      {loadingInstallments ? (
        <div className="text-center py-4">Chargement des échéances...</div>
      ) : installments.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground">
          Aucune échéance impayée trouvée
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {installments.map((installment) => {
            const remaining = calculateRemainingDue(installment);
            const isSelected = selectedInstallments[installment.id] || false;
            return (
              <div
                key={installment.id}
                className="border rounded-lg p-4 flex items-start gap-4"
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleInstallment(installment.id)}
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium">
                        {installment.period_month}/{installment.period_year} - Échéance du{' '}
                        {formatDate(installment.due_date)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Reste à payer: {formatCurrency(remaining, installment.currency)}
                      </p>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="mt-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Montant à allouer (laisser vide pour allouer automatiquement)
                      </label>
                      <Input
                        type="text"
                        value={formatNumberWithSpaces(amounts[installment.id] || '')}
                        onChange={(e) => {
                          const cleaned = parseFormattedNumber(e.target.value);
                          // Validate max value
                          const numValue = parseFloat(cleaned);
                          if (!cleaned || (numValue >= 0 && numValue <= remaining)) {
                            setAmounts((prev) => ({
                              ...prev,
                              [installment.id]: cleaned,
                            }));
                          }
                        }}
                        placeholder={`Max: ${formatCurrency(remaining, installment.currency)}`}
                        className="w-full"
                        inputMode="numeric"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-end gap-4 pt-4 border-t">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting || loading}>
            Annuler
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || loading || installments.length === 0}>
          {isSubmitting || loading ? 'Allocation...' : 'Allouer le paiement'}
        </Button>
      </div>
    </form>
  );
};
