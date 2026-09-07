import React, { useState } from 'react';
import { Button } from '../ui/button';
import { CrmContactRoleType } from '../../types/crm-types';
import { UserCheck } from 'lucide-react';

interface ConvertContactDialogProps {
  contactName: string;
  onSubmit: (roles: CrmContactRoleType[]) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

const roleOptions: { value: CrmContactRoleType; label: string }[] = [
  { value: 'PROPRIETAIRE', label: 'Propriétaire (Owner)' },
  { value: 'LOCATAIRE', label: 'Locataire (Renter)' },
  { value: 'COPROPRIETAIRE', label: 'Copropriétaire (Co-owner)' },
  { value: 'ACQUEREUR', label: 'Acquéreur (Buyer)' },
];

export const ConvertContactDialog: React.FC<ConvertContactDialogProps> = ({
  contactName,
  onSubmit,
  onCancel,
  loading = false,
}) => {
  const [selectedRoles, setSelectedRoles] = useState<CrmContactRoleType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRoleToggle = (role: CrmContactRoleType) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedRoles.length === 0) {
      setError('Please select at least one role');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(selectedRoles);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error converting contact');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-100 rounded-full p-2">
              <UserCheck className="h-5 w-5 text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold">Convert Lead to Client</h2>
          </div>

          <p className="text-gray-600 mb-6">
            Convert <strong>{contactName}</strong> from a lead to an active client by assigning one or more roles.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="space-y-3 mb-6">
              {roleOptions.map((role) => (
                <label
                  key={role.value}
                  className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(role.value)}
                    onChange={() => handleRoleToggle(role.value)}
                    className="mr-3 h-4 w-4 text-blue-600"
                  />
                  <span className="text-sm font-medium text-gray-900">{role.label}</span>
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting || loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || loading || selectedRoles.length === 0}>
                {isSubmitting || loading ? 'Converting...' : 'Convert to Client'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};





