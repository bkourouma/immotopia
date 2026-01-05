import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  GenerateDocumentRequest,
  RentalDocumentType,
} from '../../services/rental-service';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import apiClient from '../../utils/api-client';

interface DocumentTemplate {
  id: string;
  name: string;
  doc_type: string;
  status: string;
  is_default: boolean;
}

interface DocumentFormProps {
  tenantId: string;
  leaseId?: string;
  installmentId?: string;
  paymentId?: string;
  onSubmit: (data: GenerateDocumentRequest) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

export const DocumentForm: React.FC<DocumentFormProps> = ({
  tenantId,
  leaseId,
  installmentId,
  paymentId,
  onSubmit,
  onCancel,
  loading = false,
}) => {
  const [formData, setFormData] = useState({
    type: RentalDocumentType.LEASE_CONTRACT,
    templateId: '',
    title: '',
    description: '',
  });

  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Map RentalDocumentType to DocumentType
  const getDocTypeForTemplate = (type: RentalDocumentType): string => {
    const map: Record<RentalDocumentType, string> = {
      LEASE_CONTRACT: 'LEASE_HABITATION',
      LEASE_ADDENDUM: 'LEASE_HABITATION',
      RENT_RECEIPT: 'RENT_RECEIPT',
      RENT_QUITTANCE: 'RENT_RECEIPT',
      DEPOSIT_RECEIPT: 'RENT_RECEIPT',
      STATEMENT: 'RENT_STATEMENT',
      OTHER: 'RENT_RECEIPT'
    };
    return map[type] || 'RENT_RECEIPT';
  };

  // Load templates when document type changes
  useEffect(() => {
    if (tenantId && formData.type) {
      loadTemplates();
    }
  }, [tenantId, formData.type]);

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const docType = getDocTypeForTemplate(formData.type);
      const response = await apiClient.get(
        `/tenants/${tenantId}/documents/templates?docType=${docType}&status=ACTIVE`
      );
      
      if (response.data.success) {
        const availableTemplates = response.data.data || [];
        setTemplates(availableTemplates);
        
        // Auto-select default template if available
        const defaultTemplate = availableTemplates.find((t: DocumentTemplate) => t.is_default);
        if (defaultTemplate && !formData.templateId) {
          setFormData(prev => ({ ...prev, templateId: defaultTemplate.id }));
        }
      }
    } catch (err) {
      console.error('Error loading templates', err);
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);
    try {
      const submitData: GenerateDocumentRequest & { templateId?: string } = {
        type: formData.type,
        leaseId: leaseId || undefined,
        installmentId: installmentId || undefined,
        paymentId: paymentId || undefined,
        title: formData.title || undefined,
        description: formData.description || undefined,
        templateId: formData.templateId || undefined,
      };

      await onSubmit(submitData);
    } catch (error: any) {
      if (error.response?.data?.message) {
        setErrors({ submit: error.response.data.message });
      } else {
        setErrors({ submit: 'Une erreur est survenue lors de la génération du document' });
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
            Type de document <span className="text-red-500">*</span>
          </label>
          <Select
            value={formData.type}
            onValueChange={(value) => handleChange('type', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={RentalDocumentType.LEASE_CONTRACT}>Contrat de bail</SelectItem>
              <SelectItem value={RentalDocumentType.LEASE_ADDENDUM}>Avenant</SelectItem>
              <SelectItem value={RentalDocumentType.RENT_RECEIPT}>Reçu de loyer</SelectItem>
              <SelectItem value={RentalDocumentType.RENT_QUITTANCE}>Quittance de loyer</SelectItem>
              <SelectItem value={RentalDocumentType.DEPOSIT_RECEIPT}>Reçu de dépôt</SelectItem>
              <SelectItem value={RentalDocumentType.STATEMENT}>Relevé</SelectItem>
              <SelectItem value={RentalDocumentType.OTHER}>Autre</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Titre (optionnel)
          </label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => handleChange('title', e.target.value)}
            placeholder="Titre du document"
          />
        </div>

        <div>
          <label htmlFor="templateId" className="block text-sm font-medium text-gray-700 mb-1">
            Template (optionnel)
          </label>
          <Select
            value={formData.templateId}
            onValueChange={(value) => handleChange('templateId', value)}
            disabled={loadingTemplates || templates.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={loadingTemplates ? 'Chargement...' : templates.length === 0 ? 'Aucun template disponible' : 'Sélectionner un template'} />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name} {template.is_default && '(Par défaut)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {templates.length === 0 && !loadingTemplates && (
            <p className="text-xs text-gray-500 mt-1">
              Aucun template actif pour ce type de document. Le template par défaut sera utilisé.
            </p>
          )}
        </div>

        <div className="md:col-span-2">
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Description (optionnel)
          </label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Description du document"
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
          {isSubmitting || loading ? 'Génération...' : 'Générer le document'}
        </Button>
      </div>
    </form>
  );
};





