import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  CreatePaymentRequest,
  RentalPaymentMethod,
} from '../../services/rental-service';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { formatNumberWithSpaces, parseFormattedNumber } from '../../lib/utils';

interface PaymentFormProps {
  tenantId: string;
  leaseId?: string;
  onSubmit: (data: CreatePaymentRequest) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

export const PaymentForm: React.FC<PaymentFormProps> = ({
  tenantId,
  leaseId,
  onSubmit,
  onCancel,
  loading = false,
}) => {
  const [formData, setFormData] = useState({
    leaseId: leaseId || '',
    method: RentalPaymentMethod.CASH,
    amount: '',
    currency: 'FCFA',
    mmOperator: '',
    mmPhone: '',
    pspName: '',
    pspTransactionId: '',
    pspReference: '',
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
    if (formData.method === RentalPaymentMethod.MOBILE_MONEY) {
      if (!formData.mmOperator) {
        newErrors.mmOperator = 'L\'opérateur mobile money est requis';
      }
      if (!formData.mmPhone) {
        newErrors.mmPhone = 'Le numéro de téléphone est requis';
      }
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const submitData: CreatePaymentRequest = {
        leaseId: formData.leaseId || undefined,
        method: formData.method,
        amount: parseFloat(parsedAmount),
        currency: formData.currency,
        mmOperator: formData.mmOperator || undefined,
        mmPhone: formData.mmPhone || undefined,
        pspName: formData.pspName || undefined,
        pspTransactionId: formData.pspTransactionId || undefined,
        pspReference: formData.pspReference || undefined,
      };

      await onSubmit(submitData);
    } catch (error: any) {
      if (error.response?.data?.errors) {
        const apiErrors: Record<string, string> = {};
        error.response.data.errors.forEach((err: { field: string; message: string }) => {
          apiErrors[err.field] = err.message;
        });
        setErrors(apiErrors);
      } else if (error.response?.data?.message) {
        setErrors({ submit: error.response.data.message });
      } else {
        setErrors({ submit: 'Une erreur est survenue lors de l\'enregistrement du paiement' });
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
          <label htmlFor="method" className="block text-sm font-medium text-gray-700 mb-1">
            Méthode de paiement <span className="text-red-500">*</span>
          </label>
          <Select
            value={formData.method}
            onValueChange={(value) => handleChange('method', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={RentalPaymentMethod.CASH}>Espèces</SelectItem>
              <SelectItem value={RentalPaymentMethod.BANK_TRANSFER}>Virement bancaire</SelectItem>
              <SelectItem value={RentalPaymentMethod.CHECK}>Chèque</SelectItem>
              <SelectItem value={RentalPaymentMethod.MOBILE_MONEY}>Mobile Money</SelectItem>
              <SelectItem value={RentalPaymentMethod.CARD}>Carte bancaire</SelectItem>
              <SelectItem value={RentalPaymentMethod.OTHER}>Autre</SelectItem>
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
            placeholder="Ex: 150 000"
            inputMode="numeric"
            required
          />
          {errors.amount && <p className="mt-1 text-sm text-red-600">{errors.amount}</p>}
        </div>

        <div>
          <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1">
            Devise
          </label>
          <Select value={formData.currency} onValueChange={(value) => handleChange('currency', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FCFA">FCFA</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {formData.method === RentalPaymentMethod.MOBILE_MONEY && (
          <>
            <div>
              <label htmlFor="mmOperator" className="block text-sm font-medium text-gray-700 mb-1">
                Opérateur <span className="text-red-500">*</span>
              </label>
              <Select
                value={formData.mmOperator}
                onValueChange={(value) => handleChange('mmOperator', value)}
              >
                <SelectTrigger className={errors.mmOperator ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Sélectionner un opérateur" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ORANGE">Orange Money</SelectItem>
                  <SelectItem value="MTN">MTN Mobile Money</SelectItem>
                  <SelectItem value="MOOV">Moov Money</SelectItem>
                  <SelectItem value="WAVE">Wave</SelectItem>
                  <SelectItem value="OTHER">Autre</SelectItem>
                </SelectContent>
              </Select>
              {errors.mmOperator && <p className="mt-1 text-sm text-red-600">{errors.mmOperator}</p>}
            </div>

            <div>
              <label htmlFor="mmPhone" className="block text-sm font-medium text-gray-700 mb-1">
                Numéro de téléphone <span className="text-red-500">*</span>
              </label>
              <Input
                id="mmPhone"
                type="tel"
                value={formData.mmPhone}
                onChange={(e) => handleChange('mmPhone', e.target.value)}
                className={errors.mmPhone ? 'border-red-500' : ''}
                placeholder="+225 XX XX XX XX XX"
                required
              />
              {errors.mmPhone && <p className="mt-1 text-sm text-red-600">{errors.mmPhone}</p>}
            </div>
          </>
        )}

        <div>
          <label htmlFor="pspName" className="block text-sm font-medium text-gray-700 mb-1">
            PSP (optionnel)
          </label>
          <Input
            id="pspName"
            value={formData.pspName}
            onChange={(e) => handleChange('pspName', e.target.value)}
            placeholder="Nom du prestataire de services de paiement"
          />
        </div>

        <div>
          <label htmlFor="pspTransactionId" className="block text-sm font-medium text-gray-700 mb-1">
            ID Transaction PSP (optionnel)
          </label>
          <Input
            id="pspTransactionId"
            value={formData.pspTransactionId}
            onChange={(e) => handleChange('pspTransactionId', e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="pspReference" className="block text-sm font-medium text-gray-700 mb-1">
            Référence PSP (optionnel)
          </label>
          <Input
            id="pspReference"
            value={formData.pspReference}
            onChange={(e) => handleChange('pspReference', e.target.value)}
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
          {isSubmitting || loading ? 'Enregistrement...' : 'Enregistrer le paiement'}
        </Button>
      </div>
    </form>
  );
};





