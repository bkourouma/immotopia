import React from 'react';
import { Button } from '../ui/button';
import { DealForm } from './DealForm';
import { CreateCrmDealRequest } from '../../types/crm-types';
import { Briefcase, X } from 'lucide-react';

interface AddDealDialogProps {
  tenantId: string;
  contactId: string;
  contactName: string;
  onSubmit: (data: CreateCrmDealRequest) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export const AddDealDialog: React.FC<AddDealDialogProps> = ({
  tenantId,
  contactId,
  contactName,
  onSubmit,
  onCancel,
  loading = false,
}) => {
  const handleSubmit = async (data: CreateCrmDealRequest | any) => {
    await onSubmit(data as CreateCrmDealRequest);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 rounded-full p-2">
              <Briefcase className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Nouvelle affaire</h2>
              <p className="text-sm text-gray-600">Pour {contactName}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-8 w-8 p-0"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Form Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          <DealForm
            tenantId={tenantId}
            contactId={contactId}
            onSubmit={handleSubmit}
            onCancel={onCancel}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
};


