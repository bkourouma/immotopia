import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Table,
  Button,
  Tag,
  Space,
  Typography,
  Empty,
  Alert,
  Input,
  Modal,
  Form,
  InputNumber,
  Upload,
  Row,
  Col
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { Edit, X, Upload as UploadIcon, Download, FileText } from 'lucide-react';
import { Button as UIButton } from '../../components/ui/button';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import {
  listPenalties,
  calculatePenalties,
  updatePenalty,
  deletePenalty,
  uploadPenaltyJustification,
  RentalPenalty,
  PenaltyFilters
} from '../../services/rental-service';
import { API_URL } from '../../config/api';

const { Text, Title } = Typography;

interface PenaltiesProps {
  leaseId?: string;
}

export const Penalties: React.FC<PenaltiesProps> = ({ leaseId: propLeaseId }) => {
  const { tenantId, leaseId: paramLeaseId } = useParams<{ tenantId: string; leaseId?: string }>();
  const leaseId = propLeaseId || paramLeaseId;
  const [penalties, setPenalties] = useState<RentalPenalty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [showAdjustForm, setShowAdjustForm] = useState(false);
  const [showJustificationForm, setShowJustificationForm] = useState(false);
  const [selectedPenalty, setSelectedPenalty] = useState<RentalPenalty | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<PenaltyFilters>({
    leaseId: leaseId,
    page: 1,
    limit: 50
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });

  useEffect(() => {
    if (tenantId) {
      loadPenalties();
    }
  }, [tenantId, filters, leaseId]);

  // Note: Auto-calculation on mount is disabled to prevent overwriting manual penalties
  // Users can manually trigger calculation using the "Calculer les pénalités" button
  // useEffect(() => {
  //   if (tenantId && leaseId) {
  //     autoCalculatePenalties();
  //   }
  // }, [tenantId, leaseId]);

  const loadPenalties = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listPenalties(tenantId, {
        ...filters,
        leaseId: leaseId || filters.leaseId
      });
      if (response.success) {
        setPenalties(response.data || []);
        // Update pagination with data length since API doesn't return pagination
        setPagination({
          page: 1,
          limit: 50,
          total: (response.data || []).length,
          totalPages: 1
        });
      } else {
        setError('Erreur lors du chargement des pénalités');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des pénalités');
    } finally {
      setLoading(false);
    }
  };

  const handleCalculate = async () => {
    if (!tenantId || !leaseId) return;
    setCalculating(true);
    setError(null);
    try {
      const response = await calculatePenalties(tenantId);
      if (response.success) {
        await loadPenalties();
      } else {
        setError('Erreur lors du calcul des pénalités');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du calcul des pénalités');
    } finally {
      setCalculating(false);
    }
  };

  const autoCalculatePenalties = async () => {
    if (!tenantId) return;
    try {
      // Calculate penalties silently in the background, then reload
      const response = await calculatePenalties(tenantId);
      if (response.success) {
        // Silently reload penalties after auto-calculation
        await loadPenalties();
      }
    } catch (err: any) {
      // Silently ignore errors for auto-calculation
      console.error('Auto penalty calculation failed:', err);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  const formatCurrency = (amount: number, currency: string = 'FCFA') => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency === 'FCFA' ? 'XOF' : currency
    }).format(amount);
  };

  const getJustificationInfo = (penalty: RentalPenalty) => {
    // Check both override_reason (from DB) and adjustment_reason (from interface)
    const reasonText = (penalty as any).override_reason || penalty.adjustment_reason;
    if (!reasonText) return null;
    try {
      const parsed = JSON.parse(reasonText);
      return parsed.justification || null;
    } catch {
      return null;
    }
  };

  const getAdjustmentReason = (penalty: RentalPenalty) => {
    // Check both override_reason (from DB) and adjustment_reason (from interface)
    const reasonText = (penalty as any).override_reason || penalty.adjustment_reason;
    if (!reasonText) return null;
    try {
      const parsed = JSON.parse(reasonText);
      return parsed.reason || reasonText;
    } catch {
      return reasonText;
    }
  };

  const handleOpenAdjustForm = (penalty: RentalPenalty) => {
    setSelectedPenalty(penalty);
    setAdjustAmount(penalty.adjusted_amount?.toString() || penalty.amount.toString());
    setAdjustReason(getAdjustmentReason(penalty) || '');
    setShowAdjustForm(true);
  };

  const handleOpenJustificationForm = (penalty: RentalPenalty) => {
    setSelectedPenalty(penalty);
    setShowJustificationForm(true);
  };

  const handleAdjustPenalty = async () => {
    if (!tenantId || !selectedPenalty) return;

    const amount = parseFloat(adjustAmount);
    if (isNaN(amount) || amount < 0) {
      setError('Le montant doit être un nombre positif');
      return;
    }

    if (!adjustReason.trim()) {
      setError("Veuillez indiquer une raison pour l'ajustement");
      return;
    }

    setIsAdjusting(true);
    setError(null);
    try {
      await updatePenalty(tenantId, selectedPenalty.id, amount, adjustReason);
      setShowAdjustForm(false);
      setSelectedPenalty(null);
      setAdjustAmount('');
      setAdjustReason('');
      await loadPenalties();
    } catch (err: any) {
      setError(err.response?.data?.message || "Erreur lors de l'ajustement de la pénalité");
    } finally {
      setIsAdjusting(false);
    }
  };

  const handleDeletePenalty = async (penaltyId: string) => {
    if (!tenantId) return;

    const confirmed = window.confirm(
      'Êtes-vous sûr de vouloir supprimer cette pénalité ? Cette action est irréversible.'
    );

    if (!confirmed) return;

    setIsDeleting(penaltyId);
    setError(null);
    try {
      await deletePenalty(tenantId, penaltyId);
      await loadPenalties();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la suppression de la pénalité');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!tenantId || !selectedPenalty || !event.target.files || event.target.files.length === 0) return;

    const file = event.target.files[0];
    setIsUploading(true);
    setError(null);

    try {
      await uploadPenaltyJustification(tenantId, selectedPenalty.id, file);
      setShowJustificationForm(false);
      setSelectedPenalty(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      await loadPenalties();
    } catch (err: any) {
      setError(err.response?.data?.message || "Erreur lors de l'upload du justificatif");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadJustification = (justification: any) => {
    if (justification?.fileUrl) {
      // Construct full URL pointing to backend API server
      const apiBaseUrl = API_URL;
      // Remove /api from base URL to get the server root
      const serverBaseUrl = apiBaseUrl.replace(/\/api$/, '');
      const fullUrl = `${serverBaseUrl}${justification.fileUrl}`;
      window.open(fullUrl, '_blank');
    }
  };

  // If used as standalone page (not in tab)
  const isStandalone = !propLeaseId;

  const content = (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row gutter={[16, 16]} justify="space-between" align="middle">
          <Col xs={24} sm={24} md={12} lg={14}>
            <Title level={2} style={{ margin: 0 }}>
              Pénalités
            </Title>
            <Text type="secondary">{leaseId ? 'Pénalités du bail' : 'Gérez les pénalités de retard'}</Text>
          </Col>
          <Col xs={24} sm={24} md={12} lg={10}>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
              {leaseId && (
                <Button type="primary" icon={<ReloadOutlined />} onClick={handleCalculate} loading={calculating}>
                  Calculer les pénalités
                </Button>
              )}
            </div>
          </Col>
        </Row>

        {error && (
          <Alert message="Erreur" description={error} type="error" showIcon closable onClose={() => setError(null)} />
        )}

        {penalties.length === 0 && !loading ? (
          <Empty
            description={
              leaseId
                ? 'Aucune pénalité calculée. Cliquez sur "Calculer les pénalités" pour commencer.'
                : 'Aucune pénalité trouvée'
            }
          />
        ) : (
          <Table
            dataSource={penalties}
            loading={loading}
            rowKey="id"
            scroll={{ x: 'max-content' }}
            columns={[
              {
                title: 'Date de calcul',
                key: 'calculated_at',
                render: (_, record) => formatDate(record.calculated_at)
              },
              {
                title: 'Jours de retard',
                key: 'days_late',
                render: (_, record) => <Tag color="error">{record.days_late} jours</Tag>
              },
              {
                title: 'Montant',
                key: 'amount',
                render: (_, record) => formatCurrency(record.amount, record.currency)
              },
              {
                title: 'Montant ajusté',
                key: 'adjusted_amount',
                render: (_, record) =>
                  record.adjusted_amount
                    ? formatCurrency(record.adjusted_amount, record.currency)
                    : formatCurrency(record.amount, record.currency)
              },
              {
                title: "Raison d'ajustement",
                key: 'adjustment_reason',
                render: (_, record) => {
                  const adjustmentReason = getAdjustmentReason(record);
                  return adjustmentReason || '-';
                }
              },
              {
                title: 'Justificatif',
                key: 'justification',
                render: (_, record) => {
                  const justification = getJustificationInfo(record);
                  return justification ? (
                    <Button
                      type="link"
                      icon={<DownloadOutlined />}
                      onClick={() => handleDownloadJustification(justification)}
                    >
                      Voir
                    </Button>
                  ) : (
                    <Text type="secondary">-</Text>
                  );
                }
              },
              {
                title: 'Actions',
                key: 'actions',
                render: (_, record) => (
                  <Space>
                    <Button icon={<EditOutlined />} onClick={() => handleOpenAdjustForm(record)} size="small">
                      Ajuster
                    </Button>
                    <Button icon={<UploadOutlined />} onClick={() => handleOpenJustificationForm(record)} size="small">
                      Justificatif
                    </Button>
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDeletePenalty(record.id)}
                      loading={isDeleting === record.id}
                      size="small"
                    >
                      Supprimer
                    </Button>
                  </Space>
                )
              }
            ]}
            pagination={
              pagination.totalPages > 1
                ? {
                    current: pagination.page,
                    pageSize: pagination.limit,
                    total: pagination.total,
                    showSizeChanger: true,
                    showTotal: total => `Total ${total} pénalités`,
                    onChange: (page, pageSize) => {
                      setFilters(prev => ({ ...prev, page, limit: pageSize }));
                    }
                  }
                : false
            }
          />
        )}

        {/* Adjust Penalty Modal */}
        {showAdjustForm && selectedPenalty && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 rounded-full p-2">
                    <Edit className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Ajuster la pénalité</h2>
                    <p className="text-sm text-muted-foreground">
                      Montant initial: {formatCurrency(selectedPenalty.amount, selectedPenalty.currency)}
                    </p>
                  </div>
                </div>
                <UIButton
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowAdjustForm(false);
                    setSelectedPenalty(null);
                    setAdjustAmount('');
                    setAdjustReason('');
                  }}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-5 w-5" />
                </UIButton>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label htmlFor="adjustAmount" className="block text-sm font-medium text-gray-700 mb-1">
                    Nouveau montant
                  </label>
                  <Input
                    id="adjustAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={adjustAmount}
                    onChange={e => setAdjustAmount(e.target.value)}
                    placeholder="0.00"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label htmlFor="adjustReason" className="block text-sm font-medium text-gray-700 mb-1">
                    Raison de l'ajustement
                  </label>
                  <textarea
                    id="adjustReason"
                    value={adjustReason}
                    onChange={e => setAdjustReason(e.target.value)}
                    placeholder="Expliquez la raison de cet ajustement..."
                    rows={4}
                    className="flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1"
                  />
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-end gap-4">
                <UIButton
                  variant="outline"
                  onClick={() => {
                    setShowAdjustForm(false);
                    setSelectedPenalty(null);
                    setAdjustAmount('');
                    setAdjustReason('');
                  }}
                  disabled={isAdjusting}
                >
                  Annuler
                </UIButton>
                <UIButton onClick={handleAdjustPenalty} disabled={isAdjusting}>
                  {isAdjusting ? 'Ajustement...' : 'Ajuster la pénalité'}
                </UIButton>
              </div>
            </div>
          </div>
        )}

        {/* Upload Justification Modal */}
        {showJustificationForm && selectedPenalty && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 rounded-full p-2">
                    <UploadIcon className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Ajouter un justificatif</h2>
                    <p className="text-sm text-muted-foreground">
                      Pénalité: {formatCurrency(selectedPenalty.amount, selectedPenalty.currency)}
                    </p>
                  </div>
                </div>
                <UIButton
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowJustificationForm(false);
                    setSelectedPenalty(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-5 w-5" />
                </UIButton>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label htmlFor="justificationFile" className="block text-sm font-medium text-gray-700 mb-1">
                    Fichier justificatif
                  </label>
                  <p className="text-sm text-muted-foreground mb-2">Formats acceptés: PDF, Word, Images (JPEG, PNG)</p>
                  <input
                    id="justificationFile"
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    className="mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isUploading}
                  />
                </div>
                {getJustificationInfo(selectedPenalty) && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-blue-900 mb-2">Justificatif existant:</p>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-600" />
                      <span className="text-sm text-blue-700">
                        {getJustificationInfo(selectedPenalty)?.fileName || 'Fichier'}
                      </span>
                      <UIButton
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownloadJustification(getJustificationInfo(selectedPenalty))}
                        className="ml-auto h-8 w-8"
                      >
                        <Download className="h-4 w-4" />
                      </UIButton>
                    </div>
                    <p className="text-xs text-blue-600 mt-2">Le nouveau fichier remplacera l'ancien.</p>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-end gap-4">
                <UIButton
                  variant="outline"
                  onClick={() => {
                    setShowJustificationForm(false);
                    setSelectedPenalty(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  disabled={isUploading}
                >
                  Annuler
                </UIButton>
              </div>
            </div>
          </div>
        )}
      </Space>
    </>
  );

  if (isStandalone) {
    return <DashboardLayout>{content}</DashboardLayout>;
  }

  return content;
};
