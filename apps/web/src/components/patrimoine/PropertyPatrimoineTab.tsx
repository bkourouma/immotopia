import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
  Upload,
  message
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
  if (status === 'PLANNED') return 'Planifié';
  if (status === 'IN_PROGRESS') return 'En cours';
  if (status === 'COMPLETED') return 'Terminé';
  if (status === 'CANCELLED') return 'Annulé';
  return status;
}

function loanStatusLabel(status: PropertyLoan['status']): string {
  if (status === 'ACTIVE') return 'Actif';
  if (status === 'CLOSED') return 'Clôturé';
  if (status === 'DEFAULTED') return 'Défaillant';
  return status;
}

function valuationMethodLabel(method: AssetValuation['method']): string {
  if (method === 'MANUAL') return 'Manuelle';
  if (method === 'MARKET_ESTIMATE') return 'Estimation de marché';
  if (method === 'EXPERT_APPRAISAL') return 'Expertise';
  return method;
}

function expenseCategoryLabel(category: PropertyExpense['category']): string {
  if (category === 'PROPERTY_TAX') return 'Taxe foncière';
  if (category === 'CONDO_FEES') return 'Charges de copropriété';
  if (category === 'INSURANCE') return 'Assurance';
  if (category === 'ROUTINE_MAINTENANCE') return 'Entretien courant';
  if (category === 'RENOVATION') return 'Rénovation';
  if (category === 'MANAGEMENT_FEES') return 'Honoraires de gestion';
  if (category === 'UTILITIES') return 'Charges communes';
  if (category === 'OTHER') return 'Autre';
  return category;
}

function documentTypeLabel(type: PatrimonyDocument['type']): string {
  if (type === 'TITLE_DEED') return 'Titre de propriété';
  if (type === 'NOTARIAL_DEED') return 'Acte notarié';
  if (type === 'TAX_DOCUMENT') return 'Document fiscal';
  if (type === 'INSURANCE') return 'Assurance';
  if (type === 'TECHNICAL_DIAGNOSIS') return 'Diagnostic technique';
  if (type === 'FLOOR_PLAN') return 'Plan';
  if (type === 'BUILDING_PERMIT') return 'Permis de construire';
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
      const [valuationsRes, expensesRes, loansRes, workProgramsRes, documentsRes, yieldRes, contactsRes] = await Promise.all([
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
      const owners = contactsRes.contacts.filter((contact) =>
        (contact.roles || []).some((role) => role.active && role.role === 'PROPRIETAIRE')
      );
      setOwnerOptions(
        owners.map((owner) => ({
          value: owner.id,
          label: `${owner.firstName} ${owner.lastName}`.trim() || owner.email || owner.id
        }))
      );
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Erreur chargement patrimoine');
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
        .filter((expense) => new Date(expense.paidAt).getFullYear() === new Date().getFullYear())
        .reduce((acc, expense) => acc + Number(expense.amount), 0),
    [expenses]
  );

  const handleRecalculateYield = async (assumptions: YieldAssumptionsInput) => {
    setYieldLoading(true);
    try {
      const data = await getPropertyYield(tenantId, propertyId, assumptions);
      setYieldData(data);
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Échec du recalcul du rendement');
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
        message.success('Valorisation mise a jour');
      } else {
        await createValuation(tenantId, propertyId, payload);
        message.success('Valorisation ajoutee');
      }
      setValuationModalOpen(false);
      await loadAll();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || 'Erreur sauvegarde valorisation');
    } finally {
      setSubmitting(false);
    }
  };

  const removeValuation = async (valuationId: string) => {
    setBusyActionId(`valuation-${valuationId}`);
    try {
      await deleteValuation(tenantId, propertyId, valuationId);
      message.success('Valorisation supprimee');
      await loadAll();
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Erreur suppression valorisation');
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
        message.success('Dépense mise à jour');
      } else {
        await createExpense(tenantId, propertyId, payload);
        message.success('Dépense ajoutée');
      }
      setExpenseModalOpen(false);
      await loadAll();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || 'Erreur de sauvegarde de la dépense');
    } finally {
      setSubmitting(false);
    }
  };

  const removeExpense = async (expenseId: string) => {
    setBusyActionId(`expense-${expenseId}`);
    try {
      await deleteExpense(tenantId, propertyId, expenseId);
      message.success('Dépense supprimée');
      await loadAll();
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Erreur de suppression de la dépense');
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
        message.success('Crédit mis à jour');
      } else {
        await createLoan(tenantId, propertyId, payload);
        message.success('Crédit ajouté');
      }
      setLoanModalOpen(false);
      await loadAll();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || 'Erreur de sauvegarde du crédit');
    } finally {
      setSubmitting(false);
    }
  };

  const removeLoan = async (loanId: string) => {
    setBusyActionId(`loan-${loanId}`);
    try {
      await deleteLoan(tenantId, propertyId, loanId);
      message.success('Crédit supprimé');
      await loadAll();
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Erreur de suppression du crédit');
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
        message.success('Programme travaux mis a jour');
      } else {
        await createWorkProgram(tenantId, propertyId, payload);
        message.success('Programme travaux ajoute');
      }
      setWorkModalOpen(false);
      await loadAll();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || 'Erreur sauvegarde travaux');
    } finally {
      setSubmitting(false);
    }
  };

  const removeWorkProgram = async (programId: string) => {
    setBusyActionId(`work-${programId}`);
    try {
      await deleteWorkProgram(tenantId, propertyId, programId);
      message.success('Programme travaux supprime');
      await loadAll();
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Erreur suppression travaux');
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
        message.error('Veuillez sélectionner un fichier');
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

      message.success('Document ajouté');
      setDocumentModalOpen(false);
      setDocumentFile(null);
      await loadAll();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || 'Erreur de création du document');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    setDeletingDocumentId(documentId);
    try {
      await deleteDocument(tenantId, propertyId, documentId);
      setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
      message.success('Document supprime');
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Échec de la suppression du document');
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
        title="Gérer les valorisations"
        extra={
          <Button type="primary" onClick={openCreateValuation}>
            Ajouter
          </Button>
        }
      >
        <Table
          rowKey="id"
          dataSource={valuations}
          pagination={{ pageSize: 5 }}
          columns={[
            {
              title: 'Date',
              dataIndex: 'valuatedAt',
              render: (value: string) => new Date(value).toLocaleString('fr-FR')
            },
            {
              title: 'Valeur',
              dataIndex: 'estimatedValue',
              render: (value: number, record: AssetValuation) => `${Number(value).toLocaleString('fr-FR')} ${record.currency}`
            },
            { title: 'Méthode', dataIndex: 'method', render: (value: AssetValuation['method']) => <Tag>{valuationMethodLabel(value)}</Tag> },
            {
              title: 'Actions',
              key: 'actions',
              render: (_: unknown, record: AssetValuation) => (
                <Space>
                  <Button size="small" onClick={() => openEditValuation(record)}>
                    Modifier
                  </Button>
                  <Popconfirm title="Supprimer cette valorisation ?" onConfirm={() => removeValuation(record.id)}>
                    <Button size="small" danger loading={busyActionId === `valuation-${record.id}`}>
                      Supprimer
                    </Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Card>
      <Card
        title="Gérer les dépenses"
        extra={
          <Button type="primary" onClick={openCreateExpense}>
            Ajouter
          </Button>
        }
      >
        <Table
          rowKey="id"
          dataSource={expenses}
          pagination={{ pageSize: 5 }}
          columns={[
            { title: 'Date', dataIndex: 'paidAt', render: (value: string) => new Date(value).toLocaleDateString('fr-FR') },
            { title: 'Libellé', dataIndex: 'label' },
            { title: 'Catégorie', dataIndex: 'category', render: (value: PropertyExpense['category']) => <Tag>{expenseCategoryLabel(value)}</Tag> },
            {
              title: 'Montant',
              dataIndex: 'amount',
              render: (value: number, record: PropertyExpense) => `${Number(value).toLocaleString('fr-FR')} ${record.currency}`
            },
            {
              title: 'Actions',
              key: 'actions',
              render: (_: unknown, record: PropertyExpense) => (
                <Space>
                  <Button size="small" onClick={() => openEditExpense(record)}>
                    Modifier
                  </Button>
                  <Popconfirm title="Supprimer cette dépense ?" onConfirm={() => removeExpense(record.id)}>
                    <Button size="small" danger loading={busyActionId === `expense-${record.id}`}>
                      Supprimer
                    </Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Card>
      <Card
        title="Gérer les crédits"
        extra={
          <Button type="primary" onClick={openCreateLoan}>
            Ajouter
          </Button>
        }
      >
        <Table
          rowKey="id"
          dataSource={loans}
          pagination={{ pageSize: 5 }}
          columns={[
            { title: 'Prêteur', dataIndex: 'lender' },
            {
              title: 'Capital restant',
              dataIndex: 'remainingCapital',
              render: (value: number, record: PropertyLoan) => `${Number(value).toLocaleString('fr-FR')} ${record.currency}`
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
                    Modifier
                  </Button>
                  <Popconfirm title="Supprimer ce crédit ?" onConfirm={() => removeLoan(record.id)}>
                    <Button size="small" danger loading={busyActionId === `loan-${record.id}`}>
                      Supprimer
                    </Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Card>
      <Card
        title="Gérer les programmes de travaux"
        extra={
          <Button type="primary" onClick={openCreateWorkProgram}>
            Ajouter
          </Button>
        }
      >
        <Table
          rowKey="id"
          dataSource={workPrograms}
          pagination={{ pageSize: 5 }}
          columns={[
            { title: 'Titre', dataIndex: 'title' },
            {
              title: 'Date prévue',
              dataIndex: 'plannedDate',
              render: (value: string) => new Date(value).toLocaleDateString('fr-FR')
            },
            {
              title: 'Coût estimé',
              dataIndex: 'estimatedCost',
              render: (value: number, record: WorkProgram) => `${Number(value).toLocaleString('fr-FR')} ${record.currency}`
            },
            { title: 'Statut', dataIndex: 'status', render: (value: WorkProgram['status']) => <Tag>{workProgramStatusLabel(value)}</Tag> },
            {
              title: 'Actions',
              key: 'actions',
              render: (_: unknown, record: WorkProgram) => (
                <Space>
                  <Button size="small" onClick={() => openEditWorkProgram(record)}>
                    Modifier
                  </Button>
                  <Popconfirm title="Supprimer ce programme ?" onConfirm={() => removeWorkProgram(record.id)}>
                    <Button size="small" danger loading={busyActionId === `work-${record.id}`}>
                      Supprimer
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
        title="Ajouter un document"
        extra={
          <Button type="primary" onClick={openCreateDocument}>
            Ajouter
          </Button>
        }
      >
        <Text type="secondary">
          Les documents existants sont consultables dans le coffre-fort ci-dessous.
        </Text>
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <DocumentVault documents={documents} onDelete={handleDeleteDocument} deletingId={deletingDocumentId} />
        </Col>
      </Row>
      <Alert
        type="info"
        showIcon
        message={`Total des charges de l'année en cours : ${annualExpenses.toLocaleString('fr-FR')} XOF`}
      />

      <Modal
        title={editingValuationId ? 'Modifier valorisation' : 'Ajouter valorisation'}
        open={valuationModalOpen}
        onCancel={() => setValuationModalOpen(false)}
        onOk={submitValuation}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form layout="vertical" form={valuationForm}>
          <Form.Item name="valuatedAt" label="Date valorisation" rules={[{ required: true }]}>
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="estimatedValue" label="Valeur estimée" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="currency" label="Devise" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="acquisitionCost" label="Coût d'acquisition">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="acquisitionDate" label="Date d'acquisition">
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="method" label="Méthode" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'MANUAL', label: valuationMethodLabel('MANUAL') },
                { value: 'MARKET_ESTIMATE', label: valuationMethodLabel('MARKET_ESTIMATE') },
                { value: 'EXPERT_APPRAISAL', label: valuationMethodLabel('EXPERT_APPRAISAL') }
              ]}
            />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingExpenseId ? 'Modifier dépense' : 'Ajouter dépense'}
        open={expenseModalOpen}
        onCancel={() => setExpenseModalOpen(false)}
        onOk={submitExpense}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form layout="vertical" form={expenseForm}>
          <Form.Item name="category" label="Catégorie" rules={[{ required: true }]}>
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
          <Form.Item name="label" label="Libellé" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="amount" label="Montant" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="currency" label="Devise" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="paidAt" label="Date de paiement" rules={[{ required: true }]}>
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="isCapitalized" label="Capitalisée" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="receiptUrl" label="URL justificatif">
            <Input />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingLoanId ? 'Modifier crédit' : 'Ajouter crédit'}
        open={loanModalOpen}
        onCancel={() => setLoanModalOpen(false)}
        onOk={submitLoan}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form layout="vertical" form={loanForm}>
          <Form.Item name="lender" label="Prêteur" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="capitalAmount" label="Capital initial" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remainingCapital" label="Capital restant" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="interestRate" label="Taux d'intérêt" rules={[{ required: true }]}>
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="monthlyPayment" label="Mensualité" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="currency" label="Devise" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="startDate" label="Date de début" rules={[{ required: true }]}>
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="endDate" label="Date de fin" rules={[{ required: true }]}>
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="status" label="Statut" rules={[{ required: true }]}>
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
        title={editingWorkId ? 'Modifier programme travaux' : 'Ajouter programme travaux'}
        open={workModalOpen}
        onCancel={() => setWorkModalOpen(false)}
        onOk={submitWorkProgram}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form layout="vertical" form={workForm}>
          <Form.Item name="title" label="Titre" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="estimatedCost" label="Coût estimé" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="actualCost" label="Coût réel">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="currency" label="Devise" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="plannedDate" label="Date prévue" rules={[{ required: true }]}>
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="completedDate" label="Date de complétion">
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="status" label="Statut" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'PLANNED', label: 'Planifié' },
                { value: 'IN_PROGRESS', label: 'En cours' },
                { value: 'COMPLETED', label: 'Terminé' },
                { value: 'CANCELLED', label: 'Annulé' }
              ]}
            />
          </Form.Item>
          <Form.Item name="isCapitalized" label="Capitalisé" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Ajouter document patrimoine"
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
          <Form.Item name="title" label="Titre" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
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
          <Form.Item label="Fichier" required>
            <Upload
              beforeUpload={(file) => {
                setDocumentFile(file as RcFile);
                return false;
              }}
              maxCount={1}
              onRemove={() => {
                setDocumentFile(null);
                return true;
              }}
            >
              <Button icon={<UploadOutlined />}>Sélectionner un fichier</Button>
            </Upload>
          </Form.Item>
          <Form.Item name="expiresAt" label="Date expiration">
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="ownerContactId" label="Propriétaire (optionnel)">
            <Select
              showSearch
              allowClear
              optionFilterProp="label"
              options={ownerOptions}
              placeholder="Sélectionnez un propriétaire"
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};



