import React, { useState, useEffect } from 'react';
import {
  Card,
  Input,
  Button,
  Typography,
  Alert,
  Spin,
  Empty,
  Table,
  Tag,
  Space,
  Row,
  Col,
  DatePicker,
  Tooltip,
  Modal,
  Descriptions,
  Divider
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined, FilterOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getAuditLogs, AuditLog, AuditFilters } from '../../services/audit-service';
import { getProperty } from '../../services/property-service';
import type { Property } from '../../types/property-types';
import {
  getAuditActionLabelFr,
  getAuditEntityTypeLabelFr,
  getAuditResourceDisplayLabel
} from '../../constants/audit-labels';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Paragraph } = Typography;

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<AuditFilters>({
    page: 1,
    limit: 50
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });
  const [actionSearch, setActionSearch] = useState(filters.action || '');
  const [resourceTypeSearch, setResourceTypeSearch] = useState(filters.resourceType || '');
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [propertyDetails, setPropertyDetails] = useState<Property | null>(null);
  const [propertyLoading, setPropertyLoading] = useState(false);

  useEffect(() => {
    loadLogs();
  }, [filters]);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getAuditLogs(filters);
      if (response.success) {
        setLogs(response.data.logs);
        setPagination(response.data.pagination);
      } else {
        setError(t('Erreur lors du chargement des logs'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement des logs'));
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString(activeLocale(), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleApplyFilters = () => {
    setFilters({
      ...filters,
      page: 1,
      action: actionSearch || undefined,
      resourceType: resourceTypeSearch || undefined
    });
  };

  const handleDateRange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    if (!dates || !dates[0] || !dates[1]) {
      setFilters({ ...filters, page: 1, startDate: undefined, endDate: undefined });
      return;
    }
    setFilters({
      ...filters,
      page: 1,
      startDate: dates[0].format('YYYY-MM-DD'),
      endDate: dates[1].format('YYYY-MM-DD')
    });
  };

  const dateRangeValue: [dayjs.Dayjs, dayjs.Dayjs] | null =
    filters.startDate && filters.endDate ? [dayjs(filters.startDate), dayjs(filters.endDate)] : null;

  const openDetailModal = (record: AuditLog) => {
    setSelectedLog(record);
    setDetailModalOpen(true);
    setPropertyDetails(null);
    const isProperty =
      (record.resourceType === 'PROPERTY' || record.resourceType === 'Property') &&
      record.tenantId &&
      record.resourceId;
    if (isProperty) {
      setPropertyLoading(true);
      getProperty(record.tenantId!, record.resourceId!)
        .then(p => setPropertyDetails(p))
        .catch(() => setPropertyDetails(null))
        .finally(() => setPropertyLoading(false));
    }
  };

  const closeDetailModal = () => {
    setDetailModalOpen(false);
    setSelectedLog(null);
    setPropertyDetails(null);
  };

  const columns: ColumnsType<AuditLog> = [
    {
      title: t('Date'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (date: string) => formatDate(date)
    },
    {
      title: t('Utilisateur'),
      key: 'user',
      width: 180,
      render: (_, record) => record.user?.fullName || record.user?.email || '-'
    },
    {
      title: t('Action'),
      dataIndex: 'action',
      key: 'action',
      width: 320,
      render: (action: string, record: AuditLog) => {
        const actionLabel = getAuditActionLabelFr(action);
        const resourceLabel =
          record.resourceLabel ||
          (record.resourceId
            ? `${getAuditEntityTypeLabelFr(record.resourceType)} (${record.resourceId.slice(0, 8)}…)`
            : null);
        return (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <span style={{ fontWeight: 500 }}>{actionLabel}</span>
            {resourceLabel && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('Concerné :')} {resourceLabel}
              </Text>
            )}
          </Space>
        );
      }
    },
    {
      title: t('Ressource'),
      key: 'resource',
      render: (_, record) => {
        if (record.resourceLabel) {
          return record.resourceLabel;
        }
        const { label, tooltip } = getAuditResourceDisplayLabel(record.resourceType, record.resourceId, record.details);
        if (tooltip) {
          return (
            <Tooltip title={tooltip}>
              <span style={{ cursor: 'help', borderBottom: '1px dotted rgba(0,0,0,0.2)' }}>{label}</span>
            </Tooltip>
          );
        }
        return label;
      }
    },
    {
      title: t('Agence'),
      key: 'tenant',
      width: 140,
      render: (_, record) => record.tenant?.name || '-'
    },
    {
      title: (
        <Tooltip
          title={t("Adresse IP de l'ordinateur ou de l'appareil ayant effectué l'action (traçabilité et sécurité)")}
        >
          <span style={{ cursor: 'help', borderBottom: '1px dotted rgba(0,0,0,0.3)' }}>{t('IP client')}</span>
        </Tooltip>
      ),
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      width: 130,
      render: (ip: string) => ip || '-'
    },
    {
      title: t('Détails'),
      key: 'details',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetailModal(record)}>
          {t('Voir')}
        </Button>
      )
    }
  ];

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            {t('Audit Logs')}
          </Title>
          <Text type="secondary">{t('Historique des actions administratives')}</Text>
        </div>

        <Card>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                {t('Action')}
              </Text>
              <Input
                placeholder={t('Rechercher une action...')}
                prefix={<SearchOutlined />}
                value={actionSearch}
                onChange={e => setActionSearch(e.target.value)}
                allowClear
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                {t('Type de ressource')}
              </Text>
              <Input
                placeholder={t('Type de ressource...')}
                value={resourceTypeSearch}
                onChange={e => setResourceTypeSearch(e.target.value)}
                allowClear
              />
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                {t('Période')}
              </Text>
              <RangePicker
                style={{ width: '100%' }}
                value={dateRangeValue}
                onChange={handleDateRange}
                format="DD/MM/YYYY"
              />
            </Col>
            <Col xs={24} sm={12} md={4} style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Button type="primary" icon={<FilterOutlined />} onClick={handleApplyFilters} block>
                {t('Filtrer')}
              </Button>
            </Col>
          </Row>
        </Card>

        {error && (
          <Alert
            message={t('Erreur')}
            description={error}
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
          />
        )}

        <Card>
          <Spin spinning={loading}>
            {!loading && logs.length === 0 ? (
              <Empty description={t('Aucun log trouvé')} />
            ) : (
              <Table
                rowKey="id"
                columns={columns}
                dataSource={logs}
                scroll={{ x: 'max-content' }}
                pagination={{
                  current: pagination.page,
                  pageSize: pagination.limit,
                  total: pagination.total,
                  showSizeChanger: true,
                  showTotal: total => t('Total {{total}} résultat(s)', { total: total }),
                  pageSizeOptions: ['20', '50', '100'],
                  onChange: (page, pageSize) => {
                    setFilters({
                      ...filters,
                      page,
                      limit: pageSize || pagination.limit
                    });
                  }
                }}
                locale={{ emptyText: 'Aucune donnée' }}
              />
            )}
          </Spin>
        </Card>

        <Modal
          title={t("Détails du log d'audit")}
          open={detailModalOpen}
          onCancel={closeDetailModal}
          footer={[
            <Button key="close" onClick={closeDetailModal}>
              {t('Fermer')}
            </Button>
          ]}
          width={720}
          destroyOnClose
        >
          {selectedLog && (
            <>
              <Descriptions title={t('Informations du log')} column={1} bordered size="small">
                <Descriptions.Item label={t('Date')}>{formatDate(selectedLog.createdAt)}</Descriptions.Item>
                <Descriptions.Item label={t('Utilisateur')}>
                  {selectedLog.user?.fullName || selectedLog.user?.email || '-'}
                  {selectedLog.user?.email && (
                    <Text type="secondary" style={{ marginInlineStart: 8 }}>
                      ({selectedLog.user.email})
                    </Text>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label={t('Action')}>
                  <Tag color="blue">{getAuditActionLabelFr(selectedLog.action)}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('Type de ressource')}>
                  {getAuditEntityTypeLabelFr(selectedLog.resourceType)}
                </Descriptions.Item>
                <Descriptions.Item label={t('Identifiant ressource')}>
                  <Text code>{selectedLog.resourceId || '-'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label={t('Ressource')}>
                  {selectedLog.resourceLabel ||
                    (selectedLog.resourceId
                      ? `${getAuditEntityTypeLabelFr(selectedLog.resourceType)} (${selectedLog.resourceId})`
                      : '-')}
                </Descriptions.Item>
                <Descriptions.Item label={t('Agence')}>{selectedLog.tenant?.name || '-'}</Descriptions.Item>
                <Descriptions.Item label={t('IP client')}>{selectedLog.ipAddress || '-'}</Descriptions.Item>
                <Descriptions.Item label={'User-Agent'}>
                  {selectedLog.userAgent ? (
                    <Paragraph
                      style={{ marginBottom: 0, wordBreak: 'break-all' }}
                      ellipsis={{ rows: 2, expandable: true }}
                    >
                      {selectedLog.userAgent}
                    </Paragraph>
                  ) : (
                    '-'
                  )}
                </Descriptions.Item>
              </Descriptions>

              {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                <>
                  <Divider />
                  <Title level={5}>{t('Données enregistrées (payload)')}</Title>
                  <Descriptions column={1} bordered size="small">
                    {Object.entries(selectedLog.details).map(([key, value]) => (
                      <Descriptions.Item key={key} label={key}>
                        {typeof value === 'object' && value !== null ? (
                          <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                            {JSON.stringify(value, null, 2)}
                          </pre>
                        ) : (
                          String(value ?? '')
                        )}
                      </Descriptions.Item>
                    ))}
                  </Descriptions>
                </>
              )}

              {(selectedLog.resourceType === 'PROPERTY' || selectedLog.resourceType === 'Property') &&
                selectedLog.tenantId &&
                selectedLog.resourceId && (
                  <>
                    <Divider />
                    <Title level={5}>{t('Données de la propriété')}</Title>
                    {propertyLoading ? (
                      <Spin />
                    ) : propertyDetails ? (
                      <Descriptions column={1} bordered size="small">
                        <Descriptions.Item label={t('Référence')}>
                          {propertyDetails.internalReference}
                        </Descriptions.Item>
                        <Descriptions.Item label={t('Titre')}>{propertyDetails.title}</Descriptions.Item>
                        <Descriptions.Item label={t('Adresse')}>{propertyDetails.address}</Descriptions.Item>
                        <Descriptions.Item label={t('Type de bien')}>{propertyDetails.propertyType}</Descriptions.Item>
                        <Descriptions.Item label={t('Statut')}>{propertyDetails.status}</Descriptions.Item>
                        <Descriptions.Item label={t('Prix')}>
                          {propertyDetails.price != null
                            ? `${propertyDetails.price} ${propertyDetails.currency || ''}`
                            : '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label={t('Surface')}>
                          {propertyDetails.surfaceArea != null ? `${propertyDetails.surfaceArea} m²` : '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label={t('Pièces')}>{propertyDetails.rooms ?? '-'}</Descriptions.Item>
                        <Descriptions.Item label={t('Chambres')}>{propertyDetails.bedrooms ?? '-'}</Descriptions.Item>
                        <Descriptions.Item label={t('Modes de transaction')}>
                          {propertyDetails.transactionModes?.join(', ') || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label={t('Publié')}>
                          {propertyDetails.isPublished ? t('Oui') : t('Non')}
                        </Descriptions.Item>
                      </Descriptions>
                    ) : (
                      <Text type="secondary">
                        {t('Impossible de charger les détails de la propriété (supprimée ou accès refusé).')}
                      </Text>
                    )}
                  </>
                )}
            </>
          )}
        </Modal>
      </Space>
    </>
  );
};
