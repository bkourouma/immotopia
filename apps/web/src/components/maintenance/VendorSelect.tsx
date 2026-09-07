import React, { useState, useEffect } from 'react';
import { Select, Spin } from 'antd';
import apiClient from '../../utils/api-client';

const { Option } = Select;

interface Vendor {
  id: string;
  name: string;
  specialties?: string[];
}

interface VendorSelectProps {
  tenantId: string;
  value?: string;
  onChange?: (value: string) => void;
}

export const VendorSelect: React.FC<VendorSelectProps> = ({ tenantId, value, onChange }) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tenantId) {
      loadVendors();
    }
  }, [tenantId]);

  const loadVendors = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<{ success: boolean; data: Vendor[] }>(
        `/tenants/${tenantId}/maintenance/vendors/active`
      );
      
      if (response.data.success) {
        setVendors(response.data.data);
      }
    } catch (error) {
      console.error('Error loading vendors:', error);
      // Set empty array on error to prevent UI issues
      setVendors([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder="Sélectionner un prestataire"
      allowClear
      loading={loading}
      notFoundContent={loading ? <Spin size="small" /> : 'Aucun prestataire disponible'}
      showSearch
      filterOption={(input, option) => {
        const label = typeof option?.label === 'string' 
          ? option.label 
          : String(option?.children || '');
        return label.toLowerCase().includes(input.toLowerCase());
      }}
    >
      {vendors.map((vendor) => (
        <Option key={vendor.id} value={vendor.id}>
          {vendor.name}
          {vendor.specialties && vendor.specialties.length > 0 && (
            <span style={{ color: '#999', marginLeft: 8 }}>
              ({vendor.specialties.join(', ')})
            </span>
          )}
        </Option>
      ))}
    </Select>
  );
};
