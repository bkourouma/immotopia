import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Input,
  Select,
  DatePicker,
  Space,
  Typography,
  Tag,
  Row,
  Col,
  Spin,
} from 'antd';
import {
  FilterOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { listMembers, Member } from '../../services/membership-service';

const { Text } = Typography;
const { RangePicker } = DatePicker;

export interface AdvancedFilterConfig {
  showDateRange?: boolean;
  showAssignedTo?: boolean;
  showSource?: boolean;
  showBudget?: boolean;
  showStatus?: boolean;
  showType?: boolean;
  showContactName?: boolean;
  dateRangeLabel?: string;
  assignedToLabel?: string;
  sourceLabel?: string;
  budgetLabel?: string;
  statusLabel?: string;
  typeLabel?: string;
  contactNameLabel?: string;
  statusOptions?: Array<{ value: string; label: string }>;
  typeOptions?: Array<{ value: string; label: string }>;
}

export interface AdvancedFilters {
  startDate?: string;
  endDate?: string;
  assignedTo?: string;
  source?: string;
  budgetMin?: number;
  budgetMax?: number;
  status?: string;
  type?: string;
  contactName?: string;
}

interface AdvancedFiltersProps {
  tenantId?: string;
  config: AdvancedFilterConfig;
  filters: AdvancedFilters;
  onFiltersChange: (filters: AdvancedFilters) => void;
  onClear?: () => void;
}

export const AdvancedFilters: React.FC<AdvancedFiltersProps> = ({
  tenantId,
  config,
  filters,
  onFiltersChange,
  onClear,
}) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (config.showAssignedTo && tenantId) {
      loadMembers();
    }
  }, [tenantId, config.showAssignedTo]);

  const loadMembers = async () => {
    if (!tenantId) return;
    setLoadingMembers(true);
    try {
      const response = await listMembers(tenantId, { status: 'ACTIVE', limit: 100 });
      if (response.success) {
        setMembers(response.data.members);
      }
    } catch (err) {
      console.error('Error loading members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const updateFilter = (key: keyof AdvancedFilters, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value || undefined,
    });
  };

  const clearFilters = () => {
    const cleared: AdvancedFilters = {};
    onFiltersChange(cleared);
    if (onClear) {
      onClear();
    }
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined && v !== '');

  const activeFiltersCount = Object.values(filters).filter((v) => v !== undefined && v !== '').length;

  return (
    <Card
      size="small"
      title={
        <Space>
          <FilterOutlined />
          <span>Filtres avancés</span>
          {hasActiveFilters && (
            <Tag color="blue">{activeFiltersCount} actif(s)</Tag>
          )}
        </Space>
      }
      extra={
        <Space>
          {hasActiveFilters && (
            <Button
              type="text"
              size="small"
              icon={<ClearOutlined />}
              onClick={clearFilters}
            >
              Effacer
            </Button>
          )}
        </Space>
      }
    >
      <Row gutter={[16, 16]}>
        {/* Date Range */}
        {config.showDateRange && (
          <Col xs={24} sm={12} lg={8}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Text strong style={{ fontSize: '12px' }}>
                {config.dateRangeLabel || 'Période'}
              </Text>
              <RangePicker
                style={{ width: '100%' }}
                value={
                  filters.startDate && filters.endDate
                    ? [dayjs(filters.startDate), dayjs(filters.endDate)]
                    : null
                }
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    updateFilter('startDate', dates[0].format('YYYY-MM-DD'));
                    updateFilter('endDate', dates[1].format('YYYY-MM-DD'));
                  } else {
                    updateFilter('startDate', undefined);
                    updateFilter('endDate', undefined);
                  }
                }}
                format="DD/MM/YYYY"
              />
            </Space>
          </Col>
        )}

        {/* Assigned To */}
        {config.showAssignedTo && (
          <Col xs={24} sm={12} lg={8}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Text strong style={{ fontSize: '12px' }}>
                {config.assignedToLabel || 'Assigné à'}
              </Text>
              {loadingMembers ? (
                <Spin size="small" />
              ) : (
                <Select
                  value={filters.assignedTo}
                  onChange={(value) => updateFilter('assignedTo', value)}
                  placeholder="Tous"
                  allowClear
                  style={{ width: '100%' }}
                  showSearch
                  filterOption={(input, option) => {
                    const label = typeof option?.label === 'string' 
                      ? option.label 
                      : String(option?.children || '');
                    return label.toLowerCase().includes(input.toLowerCase());
                  }}
                  optionLabelProp="label"
                >
                  {members.map((member) => {
                    const label = member.user.fullName || member.user.email;
                    return (
                      <Select.Option key={member.userId} value={member.userId} label={label}>
                        {label}
                      </Select.Option>
                    );
                  })}
                </Select>
              )}
            </Space>
          </Col>
        )}

        {/* Source */}
        {config.showSource && (
          <Col xs={24} sm={12} lg={8}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Text strong style={{ fontSize: '12px' }}>
                {config.sourceLabel || 'Source'}
              </Text>
              <Input
                placeholder="Ex: Site web, Référence..."
                value={filters.source || ''}
                onChange={(e) => updateFilter('source', e.target.value)}
                allowClear
              />
            </Space>
          </Col>
        )}

        {/* Budget Range */}
        {config.showBudget && (
          <Col xs={24} sm={12} lg={8}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Text strong style={{ fontSize: '12px' }}>
                {config.budgetLabel || 'Budget (FCFA)'}
              </Text>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  type="number"
                  placeholder="Min"
                  value={filters.budgetMin || ''}
                  onChange={(e) => updateFilter('budgetMin', e.target.value ? parseFloat(e.target.value) : undefined)}
                  style={{ width: '50%' }}
                />
                <Input
                  type="number"
                  placeholder="Max"
                  value={filters.budgetMax || ''}
                  onChange={(e) => updateFilter('budgetMax', e.target.value ? parseFloat(e.target.value) : undefined)}
                  style={{ width: '50%' }}
                />
              </Space.Compact>
            </Space>
          </Col>
        )}

        {/* Status */}
        {config.showStatus && config.statusOptions && (
          <Col xs={24} sm={12} lg={8}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Text strong style={{ fontSize: '12px' }}>
                {config.statusLabel || 'Statut'}
              </Text>
              <Select
                value={filters.status}
                onChange={(value) => updateFilter('status', value)}
                placeholder="Tous"
                allowClear
                style={{ width: '100%' }}
              >
                {config.statusOptions.map((option) => (
                  <Select.Option key={option.value} value={option.value}>
                    {option.label}
                  </Select.Option>
                ))}
              </Select>
            </Space>
          </Col>
        )}

        {/* Type */}
        {config.showType && config.typeOptions && (
          <Col xs={24} sm={12} lg={8}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Text strong style={{ fontSize: '12px' }}>
                {config.typeLabel || 'Type'}
              </Text>
              <Select
                value={filters.type}
                onChange={(value) => updateFilter('type', value)}
                placeholder="Tous"
                allowClear
                style={{ width: '100%' }}
              >
                {config.typeOptions.map((option) => (
                  <Select.Option key={option.value} value={option.value}>
                    {option.label}
                  </Select.Option>
                ))}
              </Select>
            </Space>
          </Col>
        )}

        {/* Contact Name Search */}
        {config.showContactName && (
          <Col xs={24} sm={12} lg={8}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Text strong style={{ fontSize: '12px' }}>
                {config.contactNameLabel || 'Nom du client'}
              </Text>
              <Input
                placeholder="Rechercher par nom..."
                value={filters.contactName || ''}
                onChange={(e) => updateFilter('contactName', e.target.value)}
                allowClear
              />
            </Space>
          </Col>
        )}
      </Row>
    </Card>
  );
};





