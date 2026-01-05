import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  CreateDepositMovementRequest,
  RentalSecurityDeposit,
  RentalDepositMovementType,
} from '../../services/rental-service';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { formatNumberWithSpaces, parseFormattedNumber } from '../../lib/utils';

interface DepositMovementFormProps {
  tenantId: string;
  deposit: RentalSecurityDeposit;
  onSubmit: (data: CreateDepositMovementRequest) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

export const DepositMovementForm: React.FC<DepositMovementFormProps> = ({
  deposit,
  onSubmit,
  onCancel,
  loading = false,
}) => {
  const [formData, setFormData] = useState({
    type: RentalDepositMovementType.COLLECT,
    amount: '',
    note: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    const parsedAmount = parseFormattedNumber(formData.amount);
    if (!parsedAmount || parseFloat(parsedAmount) <= 0) {
      newErrors.amount = 'Le montant doit être supérieur à 0';
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const submitData: CreateDepositMovementRequest = {
        type: formData.type,
        amount: parseFloat(parsedAmount),
        note: formData.note || undefined,
      };

      await onSubmit(submitData);
    } catch (error: any) {
      if (error.response?.data?.message) {
        setErrors({ submit: error.response.data.message });
      } else {
        setErrors({ submit: 'Une erreur est survenue lors de l\'enregistrement du mouvement' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleNumberChange = (field: string, value: string) => {
    // Remove spaces for storage, but keep formatted for display
    const cleaned = parseFormattedNumber(value);
    handleChange(field, cleaned);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errors.submit && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
          {errors.submit}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
            Type de mouvement <span className="text-red-500">*</span>
          </label>
          <Select
            value={formData.type}
            onValueChange={(value) => handleChange('type', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={RentalDepositMovementType.COLLECT}>Collecte</SelectItem>
              <SelectItem value={RentalDepositMovementType.HOLD}>Blocage</SelectItem>
              <SelectItem value={RentalDepositMovementType.RELEASE}>Libération</SelectItem>
              <SelectItem value={RentalDepositMovementType.REFUND}>Remboursement</SelectItem>
              <SelectItem value={RentalDepositMovementType.FORFEIT}>Confiscation</SelectItem>
              <SelectItem value={RentalDepositMovementType.ADJUSTMENT}>Ajustement</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
            Montant <span className="text-red-500">*</span>
          </label>
          <Input
            id="amount"
            type="text"
            value={formatNumberWithSpaces(formData.amount)}
            onChange={(e) => handleNumberChange('amount', e.target.value)}
            className={errors.amount ? 'border-red-500' : ''}
            placeholder="Ex: 500 000"
            inputMode="numeric"
            required
          />
          {errors.amount && <p className="mt-1 text-sm text-red-600">{errors.amount}</p>}
        </div>

        <div className="md:col-span-2">
          <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-1">
            Note
          </label>
          <textarea
            id="note"
            value={formData.note}
            onChange={(e) => handleChange('note', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <div className="flex justify-end gap-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting || loading}>
            Annuler
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || loading}>
          {isSubmitting || loading ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>
    </form>
  );
};





