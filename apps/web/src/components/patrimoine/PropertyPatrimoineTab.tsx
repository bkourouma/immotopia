import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
  Upload
} from 'antd';
import type { RcFile } from 'antd/es/upload';
import { UploadOutlined } from '@ant-design/icons';
import {
  createDocument,
  createExpense,
  createLoan,
  createValuation,
  createWorkProgram,
  deleteDocument,
  deleteExpense,
  deleteLoan,
  deleteValuation,
  deleteWorkProgram,
  getPropertyYield,
  listDocuments,
  listExpenses,
  listLoans,
  listWorkPrograms,
  listValuations,
  updateExpense,
  updateLoan,
  updateValuation,
  updateWorkProgram
} from '../../services/patrimoine-service';
import type {
  AssetValuation,
  PatrimonyDocument,
  PropertyExpense,
  PropertyLoan,
  PropertyYieldData,
  WorkProgram
} from '../../types/patrimoine-types';
import { DocumentVault } from './DocumentVault';
import { ExpenseTracker } from './ExpenseTracker';
import { LoanWidget } from './LoanWidget';
import { ValuationHistory } from './ValuationHistory';
import { YieldCalculator, type YieldAssumptionsInput } from './YieldCalculator';
import { YieldProjectionChart } from './YieldProjectionChart';
import { WorkProgramTimeline } from './WorkProgramTimeline';
import { uploadDocument as uploadPropertyDocument } from '../../services/property-service';
import { listContacts } from '../../services/crm-service';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Text } = Typography;

function toDateTimeLocal(date?: string | null): string | undefined {
  if (!date) return undefined;
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const mm = pad(dt.getMonth() + 1);
  const dd = pad(dt.getDate());
  const hh = pad(dt.getHours());
  const min = pad(dt.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function toIso(value?: string): string | undefined {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

function workProgramStatusLabel(status: WorkProgram['status']): string {
  if (status === 'PLANNED') return t('Planifié');
  if (status === 'IN_PROGRESS') return t('En cours');
  if (status === 'COMPLETED') return t('Terminé');
  if (status === 'CANCELLED') return t('Annulé');
  return status;
}

function loanStatusLabel(status: PropertyLoan['status']): string {
  if (status === 'ACTIVE') return 'Actif';
  if (status === 'CLOSED') return t('Clôturé');
  if (status === 'DEFAULTED') return t('Défaillant');
  return status;
}

function valuationMethodLabel(method: AssetValuation['method']): string {
  if (method === 'MANUAL') return 'Manuelle';
  if (method === 'MARKET_ESTIMATE') return t('Estimation de marché');
  if (method === 'EXPERT_APPRAISAL') return 'Expertise';
  return method;
}

function expenseCategoryLabel(category: PropertyExpense['category']): string {
  if (category === 'PROPERTY_TAX') return t('Taxe foncière');
  if (category === 'CONDO_FEES') return t('Charges de copropriété');
  if (category === 'INSURANCE') return 'Assurance';
  if (category === 'ROUTINE_MAINTENANCE') return t('Entretien courant');
  if (category === 'RENOVATION') return t('Rénovation');
  if (category === 'MANAGEMENT_FEES') return t('Honoraires de gestion');
  if (category === 'UTILITIES') return t('Charges communes');
  if (category === 'OTHER') return 'Autre';
  return category;
}

function documentTypeLabel(type: PatrimonyDocument['type']): string {
  if (type === 'TITLE_DEED') return t('Titre de propriété');
  if (type === 'NOTARIAL_DEED') return t('Acte notarié');
  if (type === 'TAX_DOCUMENT') return t('Document fiscal');
  if (type === 'INSURANCE') return 'Assurance';
  if (type === 'TECHNICAL_DIAGNOSIS') return t('Diagnostic technique');
  if (type === 'FLOOR_PLAN') return 'Plan';
  if (type === 'BUILDING_PERMIT') return t('Permis de construire');
  if (type === 'OTHER') return 'Autre';
  return type;
}

function mapPatrimonyDocTypeToPropertyDocType(
  type: PatrimonyDocument['type']
): 'TITLE_DEED' | 'MANDATE' | 'PLAN' | 'TAX_DOCUMENT' | 'OTHER' {
  if (type === 'TITLE_DEED') return 'TITLE_DEED';
  if (type === 'TAX_DOCUMENT') return 'TAX_DOCUMENT';
  if (type === 'FLOOR_PLAN') return 'PLAN';
  return 'OTHER';
}

interface Props {
  tenantId: string;
  propertyId: string;
}

export const PropertyPatrimoineTab: React.FC<Props> = ({ tenantId, propertyId }) => {
  const { message } = App.useApp();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [yieldLoading, setYieldLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);

  const [valuations, setValuations] = useState<AssetValuation[]>([]);
  const [expenses, setExpenses] = useState<PropertyExpense[]>([]);
  const [loans, setLoans] = useState<PropertyLoan[]>([]);
  const [workPrograms, setWorkPrograms] = useState<WorkProgram[]>([]);
  const [documents, setDocuments] = useState<PatrimonyDocument[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [yieldData, setYieldData] = useState<PropertyYieldData | null>(null);

  const [valuationModalOpen, setValuationModalOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [loanModalOpen, setLoanModalOpen] = useState(false);
  const [workModalOpen, setWorkModalOpen] = useState(false);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  const [editingValuationId, setEditingValuationId] = useState<string | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);

  const [valuationForm] = Form.useForm();
  const [expenseForm] = Form.useForm();
  const [loanForm] = Form.useForm();
  const [workForm] = Form.useForm();
  const [documentForm] = Form.useForm();

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [valuationsRes, expensesRes, loansRes, workProgramsRes, documentsRes, yieldRes, contactsRes] =
        await Promise.all([
          listValuations(tenantId, propertyId),
          listExpenses(tenantId, propertyId),
          listLoans(tenantId, propertyId),
          listWorkPrograms(tenantId, propertyId),
          listDocuments(tenantId, propertyId),
          getPropertyYield(tenantId, propertyId),
          listContacts(tenantId, { page: 1, limit: 500 })
        ]);
      setValuations(valuationsRes);
      setExpenses(expensesRes);
      setLoans(loansRes);
      setWorkPrograms(workProgramsRes);
      setDocuments(documentsRes);
      setYieldData(yieldRes);
      const owners = contactsRes.contacts.filter(contact =>
        (contact.roles || []).some(role => role.active && role.role === 'PROPRIETAIRE')
      );
      setOwnerOptions(
        owners.map(owner => ({
          value: owner.id,
          label: `${owner.firstName} ${owner.lastName}`.trim() || owner.email || owner.id
        }))
      );
    } catch (e: any) {
      setError(e?.response?.data?.error || t('Erreur chargement patrimoine'));
    } finally {
      setLoading(false);
    }
  }, [propertyId, tenantId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const annualExpenses = useMemo(
    () =>
      expenses
        .filter(expense => new Date(expense.paidAt).getFullYear() === new Date().getFullYear())
        .reduce((acc, expense) => acc + Number(expense.amount), 0),
    [expenses]
  );

  const handleRecalculateYield = async (assumptions: YieldAssumptionsInput) => {
    setYieldLoading(true);
    try {
      const data = await getPropertyYield(tenantId, propertyId, assumptions);
      setYieldData(data);
    } catch (e: any) {
      message.error(e?.response?.data?.error || t('Échec du recalcul du rendement'));
    } finally {
      setYieldLoading(false);
    }
  };

  const openCreateValuation = () => {
    setEditingValuationId(null);
    valuationForm.resetFields();
    valuationForm.setFieldsValue({ currency: 'XOF', method: 'MANUAL' });
    setValuationModalOpen(true);
  };

  const openEditValuation = (item: AssetValuation) => {
    setEditingValuationId(item.id);
    valuationForm.setFieldsValue({
      valuatedAt: toDateTimeLocal(item.valuatedAt),
      estimatedValue: Number(item.estimatedValue),
      currency: item.currency,
      acquisitionCost: item.acquisitionCost ? Number(item.acquisitionCost) : undefined,
      acquisitionDate: toDateTimeLocal(item.acquisitionDate || undefined),
      method: item.method,
      notes: item.notes || undefined
    });
    setValuationModalOpen(true);
  };

  const submitValuation = async () => {
    try {
      const values = await valuationForm.validateFields();
      const payload = {
        valuatedAt: toIso(values.valuatedAt),
        estimatedValue: values.estimatedValue,
        currency: values.currency,
        acquisitionCost: values.acquisitionCost,
        acquisitionDate: toIso(values.acquisitionDate),
        method: values.method,
        notes: values.notes
      };
      setSubmitting(true);
      if (editingValuationId) {
        await updateValuation(tenantId, propertyId, editingValuationId, payload);
        message.success(t('Valorisation mise a jour'));
      } else {
        await createValuation(tenantId, propertyId, payload);
        message.success(t('Valorisation ajoutee'));
      }
      setValuationModalOpen(false);
      await loadAll();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || t('Erreur sauvegarde valorisation'));
    } finally {
      setSubmitting(false);
    }
  };

  const removeValuation = async (valuationId: string) => {
    setBusyActionId(`valuation-${valuationId}`);
    try {
      await deleteValuation(tenantId, propertyId, valuationId);
      message.success(t('Valorisation supprimee'));
      await loadAll();
    } catch (e: any) {
      message.error(e?.response?.data?.error || t('Erreur suppression valorisation'));
    } finally {
      setBusyActionId(null);
    }
  };

  const openCreateExpense = () => {
    setEditingExpenseId(null);
    expenseForm.resetFields();
    expenseForm.setFieldsValue({ currency: 'XOF', category: 'OTHER', isCapitalized: false });
    setExpenseModalOpen(true);
  };

  const openEditExpense = (item: PropertyExpense) => {
    setEditingExpenseId(item.id);
    expenseForm.setFieldsValue({
      category: item.category,
      label: item.label,
      amount: Number(item.amount),
      currency: item.currency,
      paidAt: toDateTimeLocal(item.paidAt),
      isCapitalized: item.isCapitalized,
      receiptUrl: item.receiptUrl || undefined,
      notes: item.notes || undefined
    });
    setExpenseModalOpen(true);
  };

  const submitExpense = async () => {
    try {
      const values = await expenseForm.validateFields();
      const payload = {
        category: values.category,
        label: values.label,
        amount: values.amount,
        currency: values.currency,
        paidAt: toIso(values.paidAt),
        isCapitalized: values.isCapitalized,
        receiptUrl: values.receiptUrl,
        notes: values.notes
      };
      setSubmitting(true);
      if (editingExpenseId) {
        await updateExpense(tenantId, propertyId, editingExpenseId, payload);
        message.success(t('Dépense mise à jour'));
      } else {
        await createExpense(tenantId, propertyId, payload);
        message.success(t('Dépense ajoutée'));
      }
      setExpenseModalOpen(false);
      await loadAll();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || t('Erreur de sauvegarde de la dépense'));
    } finally {
      setSubmitting(false);
    }
  };

  const removeExpense = async (expenseId: string) => {
    setBusyActionId(`expense-${expenseId}`);
    try {
      await deleteExpense(tenantId, propertyId, expenseId);
      message.success(t('Dépense supprimée'));
      await loadAll();
    } catch (e: any) {
      message.error(e?.response?.data?.error || t('Erreur de suppression de la dépense'));
    } finally {
      setBusyActionId(null);
    }
  };

  const openCreateLoan = () => {
    setEditingLoanId(null);
    loanForm.resetFields();
    loanForm.setFieldsValue({ currency: 'XOF', status: 'ACTIVE' });
    setLoanModalOpen(true);
  };

  const openEditLoan = (item: PropertyLoan) => {
    setEditingLoanId(item.id);
    loanForm.setFieldsValue({
      lender: item.lender,
      capitalAmount: Number(item.capitalAmount),
      remainingCapital: Number(item.remainingCapital),
      interestRate: Number(item.interestRate),
      monthlyPayment: Number(item.monthlyPayment),
      currency: item.currency,
      startDate: toDateTimeLocal(item.startDate),
      endDate: toDateTimeLocal(item.endDate),
      status: item.status
    });
    setLoanModalOpen(true);
  };

  const submitLoan = async () => {
    try {
      const values = await loanForm.validateFields();
      const payload = {
        lender: values.lender,
        capitalAmount: values.capitalAmount,
        remainingCapital: values.remainingCapital,
        interestRate: values.interestRate,
        monthlyPayment: values.monthlyPayment,
        currency: values.currency,
        startDate: toIso(values.startDate),
        endDate: toIso(values.endDate),
        status: values.status
      };
      setSubmitting(true);
      if (editingLoanId) {
        await updateLoan(tenantId, propertyId, editingLoanId, payload);
        message.success(t('Crédit mis à jour'));
      } else {
        await createLoan(tenantId, propertyId, payload);
        message.success(t('Crédit ajouté'));
      }
      setLoanModalOpen(false);
      await loadAll();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || t('Erreur de sauvegarde du crédit'));
    } finally {
      setSubmitting(false);
    }
  };

  const removeLoan = async (loanId: string) => {
    setBusyActionId(`loan-${loanId}`);
    try {
      await deleteLoan(tenantId, propertyId, loanId);
      message.success(t('Crédit supprimé'));
      await loadAll();
    } catch (e: any) {
      message.error(e?.response?.data?.error || t('Erreur de suppression du crédit'));
    } finally {
      setBusyActionId(null);
    }
  };

  const openCreateWorkProgram = () => {
    setEditingWorkId(null);
    workForm.resetFields();
    workForm.setFieldsValue({ currency: 'XOF', status: 'PLANNED', isCapitalized: false });
    setWorkModalOpen(true);
  };

  const openEditWorkProgram = (item: WorkProgram) => {
    setEditingWorkId(item.id);
    workForm.setFieldsValue({
      title: item.title,
      description: item.description || undefined,
      estimatedCost: Number(item.estimatedCost),
      actualCost: item.actualCost ? Number(item.actualCost) : undefined,
      currency: item.currency,
      plannedDate: toDateTimeLocal(item.plannedDate),
      completedDate: toDateTimeLocal(item.completedDate || undefined),
      status: item.status,
      isCapitalized: item.isCapitalized
    });
    setWorkModalOpen(true);
  };

  const submitWorkProgram = async () => {
    try {
      const values = await workForm.validateFields();
      const payload = {
        title: values.title,
        description: values.description,
        estimatedCost: values.estimatedCost,
        actualCost: values.actualCost,
        currency: values.currency,
        plannedDate: toIso(values.plannedDate),
        completedDate: toIso(values.completedDate),
        status: values.status,
        isCapitalized: values.isCapitalized
      };
      setSubmitting(true);
      if (editingWorkId) {
        await updateWorkProgram(tenantId, propertyId, editingWorkId, payload);
        message.success(t('Programme travaux mis a jour'));
      } else {
        await createWorkProgram(tenantId, propertyId, payload);
        message.success(t('Programme travaux ajoute'));
      }
      setWorkModalOpen(false);
      await loadAll();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || t('Erreur sauvegarde travaux'));
    } finally {
      setSubmitting(false);
    }
  };

  const removeWorkProgram = async (programId: string) => {
    setBusyActionId(`work-${programId}`);
    try {
      await deleteWorkProgram(tenantId, propertyId, programId);
      message.success(t('Programme travaux supprime'));
      await loadAll();
    } catch (e: any) {
      message.error(e?.response?.data?.error || t('Erreur suppression travaux'));
    } finally {
      setBusyActionId(null);
    }
  };

  const openCreateDocument = () => {
    documentForm.resetFields();
    documentForm.setFieldsValue({ type: 'OTHER' });
    setDocumentFile(null);
    setDocumentModalOpen(true);
  };

  const submitDocument = async () => {
    try {
      const values = await documentForm.validateFields();
      if (!documentFile) {
        message.error(t('Veuillez sélectionner un fichier'));
        return;
      }
      setSubmitting(true);

      const uploaded = await uploadPropertyDocument(
        tenantId,
        propertyId,
        documentFile,
        mapPatrimonyDocTypeToPropertyDocType(values.type),
        toIso(values.expiresAt)
      );

      try {
        await createDocument(tenantId, propertyId, {
          title: values.title,
          type: values.type,
          fileUrl: uploaded?.fileUrl || '',
          expiresAt: toIso(values.expiresAt),
          ownerContactId: values.ownerContactId
        });
      } catch {
        // Fallback: if dedicated patrimoine endpoint is not available, keep uploaded document only.
      }

      message.success(t('Document ajouté'));
      setDocumentModalOpen(false);
      setDocumentFile(null);
      await loadAll();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || t('Erreur de création du document'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    setDeletingDocumentId(documentId);
    try {
      await deleteDocument(tenantId, propertyId, documentId);
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      message.success(t('Document supprime'));
    } catch (e: any) {
      message.error(e?.response?.data?.error || t('Échec de la suppression du document'));
    } finally {
      setDeletingDocumentId(null);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '36px 0' }}>
        <Spin />
      </div>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <ValuationHistory valuations={valuations} />
        </Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <LoanWidget loans={loans} />
        </Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <ExpenseTracker expenses={expenses} />
        </Col>
      </Row>
      <Card
        title={t('Gérer les valorisations')}
        extra={
          <Button type="primary" onClick={openCreateValuation}>
            {t('Ajouter')}
          </Button>
        }
      >
        <Table
          scroll={{ x: 'max-content' }}
          rowKey="id"
          dataSource={valuations}
          pagination={{ pageSize: 5 }}
          columns={[
            {
              title: 'Date',
              dataIndex: 'valuatedAt',
              render: (value: string) => new Date(value).toLocaleString(activeLocale())
            },
            {
              title: 'Valeur',
              dataIndex: 'estimatedValue',
              render: (value: number, record: AssetValuation) =>
                `${Number(value).toLocaleString(activeLocale())} ${record.currency}`
            },
            {
              title: t('Méthode'),
              dataIndex: 'method',
              render: (value: AssetValuation['method']) => <Tag>{valuationMethodLabel(value)}</Tag>
            },
            {
              title: 'Actions',
              key: 'actions',
              render: (_: unknown, record: AssetValuation) => (
                <Space>
                  <Button size="small" onClick={() => openEditValuation(record)}>
                    {t('Modifier')}
                  </Button>
                  <Popconfirm title={t('Supprimer cette valorisation ?')} onConfirm={() => removeValuation(record.id)}>
                    <Button size="small" danger loading={busyActionId === `valuation-${record.id}`}>
                      {t('Supprimer')}
                    </Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Card>
      <Card
        title={t('Gérer les dépenses')}
        extra={
          <Button type="primary" onClick={openCreateExpense}>
            {t('Ajouter')}
          </Button>
        }
      >
        <Table
          scroll={{ x: 'max-content' }}
          rowKey="id"
          dataSource={expenses}
          pagination={{ pageSize: 5 }}
          columns={[
            {
              title: 'Date',
              dataIndex: 'paidAt',
              render: (value: string) => new Date(value).toLocaleDateString(activeLocale())
            },
            { title: t('Libellé'), dataIndex: 'label' },
            {
              title: t('Catégorie'),
              dataIndex: 'category',
              render: (value: PropertyExpense['category']) => <Tag>{expenseCategoryLabel(value)}</Tag>
            },
            {
              title: 'Montant',
              dataIndex: 'amount',
              render: (value: number, record: PropertyExpense) =>
                `${Number(value).toLocaleString(activeLocale())} ${record.currency}`
            },
            {
              title: 'Actions',
              key: 'actions',
              render: (_: unknown, record: PropertyExpense) => (
                <Space>
                  <Button size="small" onClick={() => openEditExpense(record)}>
                    {t('Modifier')}
                  </Button>
                  <Popconfirm title={t('Supprimer cette dépense ?')} onConfirm={() => removeExpense(record.id)}>
                    <Button size="small" danger loading={busyActionId === `expense-${record.id}`}>
                      {t('Supprimer')}
                    </Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Card>
      <Card
        title={t('Gérer les crédits')}
        extra={
          <Button type="primary" onClick={openCreateLoan}>
            {t('Ajouter')}
          </Button>
        }
      >
        <Table
          scroll={{ x: 'max-content' }}
          rowKey="id"
          dataSource={loans}
          pagination={{ pageSize: 5 }}
          columns={[
            { title: t('Prêteur'), dataIndex: 'lender' },
            {
              title: t('Capital restant'),
              dataIndex: 'remainingCapital',
              render: (value: number, record: PropertyLoan) =>
                `${Number(value).toLocaleString(activeLocale())} ${record.currency}`
            },
            {
              title: 'Statut',
              dataIndex: 'status',
              render: (value: PropertyLoan['status']) => <Tag>{loanStatusLabel(value)}</Tag>
            },
            {
              title: 'Actions',
              key: 'actions',
              render: (_: unknown, record: PropertyLoan) => (
                <Space>
                  <Button size="small" onClick={() => openEditLoan(record)}>
                    {t('Modifier')}
                  </Button>
                  <Popconfirm title={t('Supprimer ce crédit ?')} onConfirm={() => removeLoan(record.id)}>
                    <Button size="small" danger loading={busyActionId === `loan-${record.id}`}>
                      {t('Supprimer')}
                    </Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Card>
      <Card
        title={t('Gérer les programmes de travaux')}
        extra={
          <Button type="primary" onClick={openCreateWorkProgram}>
            {t('Ajouter')}
          </Button>
        }
      >
        <Table
          scroll={{ x: 'max-content' }}
          rowKey="id"
          dataSource={workPrograms}
          pagination={{ pageSize: 5 }}
          columns={[
            { title: 'Titre', dataIndex: 'title' },
            {
              title: t('Date prévue'),
              dataIndex: 'plannedDate',
              render: (value: string) => new Date(value).toLocaleDateString(activeLocale())
            },
            {
              title: t('Coût estimé'),
              dataIndex: 'estimatedCost',
              render: (value: number, record: WorkProgram) =>
                `${Number(value).toLocaleString(activeLocale())} ${record.currency}`
            },
            {
              title: 'Statut',
              dataIndex: 'status',
              render: (value: WorkProgram['status']) => <Tag>{workProgramStatusLabel(value)}</Tag>
            },
            {
              title: 'Actions',
              key: 'actions',
              render: (_: unknown, record: WorkProgram) => (
                <Space>
                  <Button size="small" onClick={() => openEditWorkProgram(record)}>
                    {t('Modifier')}
                  </Button>
                  <Popconfirm title={t('Supprimer ce programme ?')} onConfirm={() => removeWorkProgram(record.id)}>
                    <Button size="small" danger loading={busyActionId === `work-${record.id}`}>
                      {t('Supprimer')}
                    </Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <YieldCalculator data={yieldData} loading={yieldLoading} onRecalculate={handleRecalculateYield} />
        </Col>
        <Col xs={24}>
          <YieldProjectionChart data={yieldData?.projection ?? []} />
        </Col>
      </Row>
      <WorkProgramTimeline items={workPrograms} />
      <Card
        title={t('Ajouter un document')}
        extra={
          <Button type="primary" onClick={openCreateDocument}>
            {t('Ajouter')}
          </Button>
        }
      >
        <Text type="secondary">{t('Les documents existants sont consultables dans le coffre-fort ci-dessous.')}</Text>
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <DocumentVault documents={documents} onDelete={handleDeleteDocument} deletingId={deletingDocumentId} />
        </Col>
      </Row>
      <Alert
        type="info"
        showIcon
        message={t("Total des charges de l'année en cours : {{value}} XOF", {
          value: annualExpenses.toLocaleString(activeLocale())
        })}
      />

      <Modal
        title={editingValuationId ? t('Modifier valorisation') : t('Ajouter valorisation')}
        open={valuationModalOpen}
        onCancel={() => setValuationModalOpen(false)}
        onOk={submitValuation}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form layout="vertical" form={valuationForm}>
          <Form.Item name="valuatedAt" label={t('Date valorisation')} rules={[{ required: true }]}>
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="estimatedValue" label={t('Valeur estimée')} rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="currency" label={t('Devise')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="acquisitionCost" label={t("Coût d'acquisition")}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="acquisitionDate" label={t("Date d'acquisition")}>
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="method" label={t('Méthode')} rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'MANUAL', label: valuationMethodLabel('MANUAL') },
                { value: 'MARKET_ESTIMATE', label: valuationMethodLabel('MARKET_ESTIMATE') },
                { value: 'EXPERT_APPRAISAL', label: valuationMethodLabel('EXPERT_APPRAISAL') }
              ]}
            />
          </Form.Item>
          <Form.Item name="notes" label={t('Notes')}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingExpenseId ? t('Modifier dépense') : t('Ajouter dépense')}
        open={expenseModalOpen}
        onCancel={() => setExpenseModalOpen(false)}
        onOk={submitExpense}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form layout="vertical" form={expenseForm}>
          <Form.Item name="category" label={t('Catégorie')} rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'PROPERTY_TAX', label: expenseCategoryLabel('PROPERTY_TAX') },
                { value: 'CONDO_FEES', label: expenseCategoryLabel('CONDO_FEES') },
                { value: 'INSURANCE', label: expenseCategoryLabel('INSURANCE') },
                { value: 'ROUTINE_MAINTENANCE', label: expenseCategoryLabel('ROUTINE_MAINTENANCE') },
                { value: 'RENOVATION', label: expenseCategoryLabel('RENOVATION') },
                { value: 'MANAGEMENT_FEES', label: expenseCategoryLabel('MANAGEMENT_FEES') },
                { value: 'UTILITIES', label: expenseCategoryLabel('UTILITIES') },
                { value: 'OTHER', label: expenseCategoryLabel('OTHER') }
              ]}
            />
          </Form.Item>
          <Form.Item name="label" label={t('Libellé')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="amount" label={t('Montant')} rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="currency" label={t('Devise')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="paidAt" label={t('Date de paiement')} rules={[{ required: true }]}>
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="isCapitalized" label={t('Capitalisée')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="receiptUrl" label={t('URL justificatif')}>
            <Input />
          </Form.Item>
          <Form.Item name="notes" label={t('Notes')}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingLoanId ? t('Modifier crédit') : t('Ajouter crédit')}
        open={loanModalOpen}
        onCancel={() => setLoanModalOpen(false)}
        onOk={submitLoan}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form layout="vertical" form={loanForm}>
          <Form.Item name="lender" label={t('Prêteur')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="capitalAmount" label={t('Capital initial')} rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remainingCapital" label={t('Capital restant')} rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="interestRate" label={t("Taux d'intérêt")} rules={[{ required: true }]}>
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="monthlyPayment" label={t('Mensualité')} rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="currency" label={t('Devise')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="startDate" label={t('Date de début')} rules={[{ required: true }]}>
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="endDate" label={t('Date de fin')} rules={[{ required: true }]}>
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="status" label={t('Statut')} rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'ACTIVE', label: loanStatusLabel('ACTIVE') },
                { value: 'CLOSED', label: loanStatusLabel('CLOSED') },
                { value: 'DEFAULTED', label: loanStatusLabel('DEFAULTED') }
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingWorkId ? t('Modifier programme travaux') : t('Ajouter programme travaux')}
        open={workModalOpen}
        onCancel={() => setWorkModalOpen(false)}
        onOk={submitWorkProgram}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form layout="vertical" form={workForm}>
          <Form.Item name="title" label={t('Titre')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t('Description')}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="estimatedCost" label={t('Coût estimé')} rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="actualCost" label={t('Coût réel')}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="currency" label={t('Devise')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="plannedDate" label={t('Date prévue')} rules={[{ required: true }]}>
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="completedDate" label={t('Date de complétion')}>
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="status" label={t('Statut')} rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'PLANNED', label: t('Planifié') },
                { value: 'IN_PROGRESS', label: t('En cours') },
                { value: 'COMPLETED', label: t('Terminé') },
                { value: 'CANCELLED', label: t('Annulé') }
              ]}
            />
          </Form.Item>
          <Form.Item name="isCapitalized" label={t('Capitalisé')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('Ajouter document patrimoine')}
        open={documentModalOpen}
        onCancel={() => {
          setDocumentModalOpen(false);
          setDocumentFile(null);
        }}
        onOk={submitDocument}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form layout="vertical" form={documentForm}>
          <Form.Item name="title" label={t('Titre')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label={t('Type')} rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'TITLE_DEED', label: documentTypeLabel('TITLE_DEED') },
                { value: 'NOTARIAL_DEED', label: documentTypeLabel('NOTARIAL_DEED') },
                { value: 'TAX_DOCUMENT', label: documentTypeLabel('TAX_DOCUMENT') },
                { value: 'INSURANCE', label: documentTypeLabel('INSURANCE') },
                { value: 'TECHNICAL_DIAGNOSIS', label: documentTypeLabel('TECHNICAL_DIAGNOSIS') },
                { value: 'FLOOR_PLAN', label: documentTypeLabel('FLOOR_PLAN') },
                { value: 'BUILDING_PERMIT', label: documentTypeLabel('BUILDING_PERMIT') },
                { value: 'OTHER', label: documentTypeLabel('OTHER') }
              ]}
            />
          </Form.Item>
          <Form.Item label={t('Fichier')} required>
            <Upload
              beforeUpload={file => {
                setDocumentFile(file as RcFile);
                return false;
              }}
              maxCount={1}
              onRemove={() => {
                setDocumentFile(null);
                return true;
              }}
            >
              <Button icon={<UploadOutlined />}>{t('Sélectionner un fichier')}</Button>
            </Upload>
          </Form.Item>
          <Form.Item name="expiresAt" label={t('Date expiration')}>
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="ownerContactId" label={t('Propriétaire (optionnel)')}>
            <Select
              showSearch
              allowClear
              optionFilterProp="label"
              options={ownerOptions}
              placeholder={t('Sélectionnez un propriétaire')}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};
