import React, { useState, useEffect } from 'react';
import { Modal, Checkbox, Button, Space, Alert, Typography } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { CrmContactRoleType } from '../../types/crm-types';

const { Text } = Typography;

interface ManageRolesDialogProps {
  contactName: string;
  currentRoles: CrmContactRoleType[];
  onSubmit: (roles: CrmContactRoleType[]) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  open?: boolean;
}

const roleOptions: { value: CrmContactRoleType; label: string }[] = [
  { value: 'PROPRIETAIRE', label: 'Propriétaire (Owner)' },
  { value: 'LOCATAIRE', label: 'Locataire (Renter)' },
  { value: 'COPROPRIETAIRE', label: 'Copropriétaire (Co-owner)' },
  { value: 'ACQUEREUR', label: 'Acquéreur (Buyer)' },
];

export const ManageRolesDialog: React.FC<ManageRolesDialogProps> = ({
  contactName,
  currentRoles,
  onSubmit,
  onCancel,
  loading = false,
  open = true,
}) => {
  const [selectedRoles, setSelectedRoles] = useState<CrmContactRoleType[]>(currentRoles);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update selected roles when currentRoles changes
  useEffect(() => {
    setSelectedRoles(currentRoles);
  }, [currentRoles]);

  const handleRoleToggle = (role: CrmContactRoleType) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(selectedRoles);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour des rôles');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <UserOutlined style={{ color: '#1890ff' }} />
          <span>Gérer les rôles</span>
        </Space>
      }
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={isSubmitting || loading}
      okText="Enregistrer"
      cancelText="Annuler"
      width={500}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Text>
          Sélectionnez les rôles pour <strong>{contactName}</strong>.
        </Text>

        {error && (
          <Alert message={error} type="error" showIcon />
        )}

        <Checkbox.Group
          value={selectedRoles}
          onChange={(values) => setSelectedRoles(values as CrmContactRoleType[])}
          style={{ width: '100%' }}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            {roleOptions.map((role) => (
              <Checkbox
                key={role.value}
                value={role.value}
                style={{
                  padding: '12px',
                  border: '1px solid #d9d9d9',
                  borderRadius: '6px',
                  width: '100%',
                  marginBottom: '8px',
                }}
              >
                {role.label}
              </Checkbox>
            ))}
          </Space>
        </Checkbox.Group>
      </Space>
    </Modal>
  );
};

