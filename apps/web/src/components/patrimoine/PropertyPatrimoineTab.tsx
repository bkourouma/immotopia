import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Typography,
  Upload
} from 'antd';
import type { RcFile } from 'antd/es/upload';
import { UploadOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { queryKey } from '../../lib/query-keys';
import {
  createExpense,
  createLoan,
  createValuation,
  createWorkProgram,
  deleteExpense,
  deleteLoan,
  deleteValuation,
  deleteWorkProgram,
  getPropertyYield,
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
  ExpenseRecurrence,
  PaymentMethod,
  PropertyExpense,
  PropertyLoan,
  PropertyYieldData,
  WorkProgram
} from '../../types/patrimoine-types';
import type { PropertyDocument } from '../../types/property-types';
import { DocumentVault } from './DocumentVault';
import { PatrimoineExportButton } from './PatrimoineExportButton';
import { YieldCalculator, type YieldAssumptionsInput } from './YieldCalculator';
import { loadYieldAssumptions, persistYieldAssumptions } from './yield-assumptions-storage';
import { YieldProjectionChart } from './YieldProjectionChart';
import { WorkProgramTimeline } from './WorkProgramTimeline';
import { ValuationsSection } from './property-tab/ValuationsSection';
import { ExpensesSection } from './property-tab/ExpensesSection';
import { LoansSection } from './property-tab/LoansSection';
import { WorksSection } from './property-tab/WorksSection';
import { RUBRIQUE_PARAM, parseRubrique } from './property-tab/rubriques';
import type { Rubrique } from './property-tab/rubriques';
import {
  listPropertyDocuments,
  uploadDocument as uploadPropertyDocument,
  deletePropertyDocument
} from '../../services/property-service';
import { TreasuryAccountSelector } from '../finance/TreasuryAccountSelector';
import { t } from '../../i18n/t';
import { formatMoney } from '../primitives';
import {
  DEVISE_PATRIMOINE,
  apiErrorMessage,
  documentTypeOptions,
  EXPENSE_RECURRENCES,
  expenseCategoryLabel,
  expenseRecurrenceLabel,
  loanStatusLabel,
  valuationMethodLabel
} from './patrimoine-labels';

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

/** Date seule (AAAA-MM-JJ, UTC) d'une date ISO, pour un champ `type="date"`. */
function toDateInput(date?: string | null): string | undefined {
  if (!date) return undefined;
  const dt = new Date(date);
  return Number.isNaN(dt.getTime()) ? undefined : dt.toISOString().slice(0, 10);
}

function toIso(value?: string): string | undefined {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

function paymentMethodLabel(method: PaymentMethod): string {
  if (method === 'CASH') return t('Espèces');
  if (method === 'BANK_TRANSFER') return t('Virement bancaire');
  if (method === 'CHECK') return t('Chèque');
  if (method === 'MOBILE_MONEY') return t('Mobile Money');
  if (method === 'CARD') return t('Carte bancaire');
  if (method === 'OTHER') return t('Autre');
  return method;
}

/**
 * Adaptateur Form.Item : `value` et `onChange` sont injectés par le formulaire,
 * alors que `TreasuryAccountSelector` les exige explicitement.
 */
const ExpenseTreasuryAccountField: React.FC<{
  tenantId: string;
  paymentMethod?: PaymentMethod;
  value?: string | null;
  onChange?: (id: string | null) => void;
}> = ({ tenantId, paymentMethod, value, onChange }) => (
  <TreasuryAccountSelector
    tenantId={tenantId}
    paymentMethod={paymentMethod}
    value={value}
    onChange={id => onChange?.(id)}
  />
);

interface Props {
  tenantId: string;
  propertyId: string;
}

/**
 * Un chargement en échec par section, jamais un seul « tout ou rien » : un
 * bien avec des documents mais un rendement en échec (prix d'acquisition
 * absent, service indisponible…) doit quand même montrer ses documents.
 */
type SectionKey = 'valuations' | 'expenses' | 'loans' | 'workPrograms' | 'documents' | 'yieldData';
type SectionErrors = Partial<Record<SectionKey, string>>;

/** Chaque rubrique ne charge que sa propre donnée : une requête (la synthèse : rendement + hypothèses). */
const SECTION_DE_RUBRIQUE: Record<Rubrique, SectionKey> = {
  synthese: 'yieldData',
  valorisations: 'valuations',
  depenses: 'expenses',
  credits: 'loans',
  travaux: 'workPrograms',
  documents: 'documents'
};

const ERREUR_CHARGEMENT = (key: SectionKey): string => {
  if (key === 'valuations') return t('Erreur de chargement des valorisations');
  if (key === 'expenses') return t('Erreur de chargement des dépenses');
  if (key === 'loans') return t('Erreur de chargement des crédits');
  if (key === 'workPrograms') return t('Erreur de chargement des travaux');
  if (key === 'documents') return t('Erreur de chargement des documents');
  return t('Erreur de chargement du rendement');
};

const BlocChargement: React.FC = () => (
  <div style={{ textAlign: 'center', padding: '36px 0' }}>
    <Spin />
  </div>
);

// Préfixes de recherche des rubriques (valorisations, dépenses, crédits, travaux, documents).
const PREFIXES_RECHERCHE = ['val.', 'dep.', 'cre.', 'trv.', 'doc.'];

export const PropertyPatrimoineTab: React.FC<Props> = ({ tenantId, propertyId }) => {
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const [searchParams, setSearchParams] = useSearchParams();
  const rubrique = parseRubrique(searchParams.get(RUBRIQUE_PARAM));
  // Remplace l'entrée d'historique et ne touche à aucun autre paramètre (`onglet`, recherches préfixées).
  const changerRubrique = (key: string) =>
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        // Les critères d'une rubrique n'ont pas de sens dans une autre : on retire leurs clés préfixées.
        for (const k of Array.from(next.keys())) {
          if (PREFIXES_RECHERCHE.some(p => k.startsWith(p))) next.delete(k);
        }
        next.set(RUBRIQUE_PARAM, key);
        return next;
      },
      { replace: true }
    );

  // « loading » : premier chargement de la section ; absent = pas encore demandée ou périmée.
  const [sectionStatus, setSectionStatus] = useState<Partial<Record<SectionKey, 'loading' | 'loaded' | 'error'>>>({});
  const [sectionErrors, setSectionErrors] = useState<SectionErrors>({});
  const [yieldLoading, setYieldLoading] = useState(false);
  const [yieldAssumptions, setYieldAssumptions] = useState<YieldAssumptionsInput | undefined>(undefined);
  const [yieldSyncStatus, setYieldSyncStatus] = useState<'synced' | 'local'>('synced');
  // Ignore la réponse d'un chargement périmé : une requête plus récente de la même section, ou un
  // changement d'agence ou de bien en cours de route (`epoch`).
  const loadSeq = useRef<Partial<Record<SectionKey, number>>>({});
  const epoch = useRef(0);
  const scope = useRef<string | null>(null);
  // Sections à jour : une section déjà chargée n'est pas rechargée tant qu'elle n'est pas périmée.
  const freshSections = useRef<Set<SectionKey>>(new Set());
  const currentKey = useRef('');
  currentKey.current = `${tenantId}:${propertyId}`;
  const [submitting, setSubmitting] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);

  const [valuations, setValuations] = useState<AssetValuation[]>([]);
  const [expenses, setExpenses] = useState<PropertyExpense[]>([]);
  const [loans, setLoans] = useState<PropertyLoan[]>([]);
  const [workPrograms, setWorkPrograms] = useState<WorkProgram[]>([]);
  const [documents, setDocuments] = useState<PropertyDocument[]>([]);
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
  const [editingWorkProgram, setEditingWorkProgram] = useState<WorkProgram | null>(null);

  const [valuationForm] = Form.useForm();
  const [expenseForm] = Form.useForm();
  const [loanForm] = Form.useForm();
  const [workForm] = Form.useForm();
  const [documentForm] = Form.useForm();

  // Moyen de paiement et « agence acheteuse » de la dépense en cours de saisie,
  // pour filtrer le compte de trésorerie proposé et rendre le fournisseur requis.
  const expensePaymentMethod = Form.useWatch('paymentMethod', expenseForm) as PaymentMethod | undefined;
  const expenseAgencyIsBuyer = Form.useWatch('agencyIsBuyer', expenseForm) as boolean | undefined;
  const expenseRecurrence = Form.useWatch('recurrence', expenseForm) as ExpenseRecurrence | undefined;

  /**
   * Charge UNE section (la rubrique affichée). Le premier chargement montre un indicateur ;
   * un rechargement après mutation garde le tableau affiché. Un échec reste propre à sa section.
   */
  const loadSection = useCallback(
    async (key: SectionKey) => {
      const startEpoch = epoch.current;
      const seq = (loadSeq.current[key] = (loadSeq.current[key] ?? 0) + 1);
      const perime = () => startEpoch !== epoch.current || seq !== loadSeq.current[key];
      setSectionStatus(prev => (prev[key] === 'loaded' ? prev : { ...prev, [key]: 'loading' }));
      try {
        if (key === 'valuations') {
          const data = await listValuations(tenantId, propertyId);
          if (perime()) return;
          setValuations(data);
        } else if (key === 'expenses') {
          const data = await listExpenses(tenantId, propertyId);
          if (perime()) return;
          setExpenses(data);
        } else if (key === 'loans') {
          const data = await listLoans(tenantId, propertyId);
          if (perime()) return;
          setLoans(data);
        } else if (key === 'workPrograms') {
          const data = await listWorkPrograms(tenantId, propertyId);
          if (perime()) return;
          setWorkPrograms(data);
        } else if (key === 'documents') {
          const data = await listPropertyDocuments(tenantId, propertyId);
          if (perime()) return;
          setDocuments(data);
        } else {
          const loaded = await loadYieldAssumptions(tenantId, propertyId);
          const data = loaded.assumptions
            ? await getPropertyYield(tenantId, propertyId, loaded.assumptions)
            : await getPropertyYield(tenantId, propertyId);
          if (perime()) return;
          setYieldData(data);
          setYieldAssumptions(loaded.assumptions);
          setYieldSyncStatus(loaded.synced ? 'synced' : 'local');
        }
        freshSections.current.add(key);
        setSectionErrors(prev => ({ ...prev, [key]: undefined }));
        setSectionStatus(prev => ({ ...prev, [key]: 'loaded' }));
      } catch (error) {
        if (perime()) return;
        if (key === 'yieldData') {
          // Pas de rendement ni d'hypothèses de l'ancien bien affichés sous le nouveau.
          setYieldData(null);
          setYieldAssumptions(undefined);
          setYieldSyncStatus('synced');
        }
        setSectionErrors(prev => ({ ...prev, [key]: apiErrorMessage(error, ERREUR_CHARGEMENT(key)) }));
        setSectionStatus(prev => ({ ...prev, [key]: 'error' }));
      }
    },
    [propertyId, tenantId]
  );

  /** Le rendement dépend des valorisations, dépenses, crédits et travaux : il se recharge à son prochain affichage. */
  const marquerRendementPerime = () => {
    freshSections.current.delete('yieldData');
    loadSeq.current.yieldData = (loadSeq.current.yieldData ?? 0) + 1;
    setSectionStatus(prev => ({ ...prev, yieldData: undefined }));
  };

  /** Après une mutation : recharge la section touchée et, si besoin, périme le rendement. */
  const rechargerApresMutation = async (key: SectionKey, rendementPerime: boolean) => {
    if (rendementPerime) marquerRendementPerime();
    await loadSection(key);
  };

  // Changement d'agence ou de bien : on repart de zéro (les réponses en vol deviennent périmées).
  useEffect(() => {
    const clef = `${tenantId}:${propertyId}`;
    if (scope.current === clef) return;
    const premierMontage = scope.current === null;
    scope.current = clef;
    epoch.current += 1;
    freshSections.current = new Set();
    loadSeq.current = {};
    if (premierMontage) return;
    setSectionStatus({});
    setSectionErrors({});
    setValuations([]);
    setExpenses([]);
    setLoans([]);
    setWorkPrograms([]);
    setDocuments([]);
    setYieldData(null);
    setYieldAssumptions(undefined);
    setYieldSyncStatus('synced');
  }, [tenantId, propertyId]);

  // Une requête seulement : celle de la rubrique affichée, si elle n'est pas déjà à jour.
  useEffect(() => {
    const key = SECTION_DE_RUBRIQUE[rubrique];
    if (freshSections.current.has(key)) return;
    void loadSection(key);
  }, [rubrique, loadSection]);

  const annualExpenses = useMemo(
    () =>
      expenses
        // Une dépense capitalisée s'ajoute à la valeur du bien, pas aux charges : l'API
        // l'exclut aussi du rendement net (BUG-2026-10-01-010).
        .filter(
          expense => !expense.isCapitalized && new Date(expense.paidAt).getFullYear() === new Date().getFullYear()
        )
        .reduce((acc, expense) => acc + Number(expense.amount), 0),
    [expenses]
  );

  const handleRecalculateYield = async (assumptions: YieldAssumptionsInput) => {
    const key = `${tenantId}:${propertyId}`;
    const memeBien = () => currentKey.current === key;
    setYieldLoading(true);
    try {
      const data = await getPropertyYield(tenantId, propertyId, assumptions);
      if (!memeBien()) return;
      // Le calcul s'affiche tout de suite ; la persistance ne le retarde pas.
      setYieldData(data);
      setYieldAssumptions(assumptions);
      setSectionErrors(prev => ({ ...prev, yieldData: undefined }));
      const { synced } = await persistYieldAssumptions(tenantId, propertyId, assumptions);
      if (memeBien()) setYieldSyncStatus(synced ? 'synced' : 'local');
    } catch (e) {
      if (memeBien()) message.error(apiErrorMessage(e, t('Échec du recalcul du rendement')));
    } finally {
      if (memeBien()) setYieldLoading(false);
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

  /**
   * La valeur marchande du profil fiscal et l'estimation fiscale dérivent de la
   * dernière valorisation : on invalide les requêtes de PropertyHoldingTaxSection
   * pour qu'elles se relancent sans rechargement (BUG-2026-10-01-002).
   */
  const invalidateTaxQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKey('property-tax-profile', tenantId, { propertyId }) }),
      queryClient.invalidateQueries({ queryKey: queryKey('property-tax-estimate', tenantId, { propertyId }) })
    ]);
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
        message.success(t('Valorisation mise à jour'));
      } else {
        await createValuation(tenantId, propertyId, payload);
        message.success(t('Valorisation ajoutée'));
      }
      setValuationModalOpen(false);
      await invalidateTaxQueries();
      await rechargerApresMutation('valuations', true);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(apiErrorMessage(e, t('Erreur de sauvegarde de la valorisation')));
    } finally {
      setSubmitting(false);
    }
  };

  const removeValuation = async (valuationId: string) => {
    setBusyActionId(`valuation-${valuationId}`);
    try {
      await deleteValuation(tenantId, propertyId, valuationId);
      message.success(t('Valorisation supprimée'));
      await invalidateTaxQueries();
      await rechargerApresMutation('valuations', true);
    } catch (e) {
      message.error(apiErrorMessage(e, t('Erreur de suppression de la valorisation')));
    } finally {
      setBusyActionId(null);
    }
  };

  const openCreateExpense = () => {
    setEditingExpenseId(null);
    expenseForm.resetFields();
    expenseForm.setFieldsValue({ currency: 'XOF', category: 'OTHER', isCapitalized: false, recurrence: 'ONE_OFF' });
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
      notes: item.notes || undefined,
      paymentMethod: item.paymentMethod || undefined,
      treasuryAccountId: item.treasuryAccountId || undefined,
      agencyIsBuyer: item.agencyIsBuyer || false,
      supplierName: item.supplierName || undefined,
      recurrence: item.recurrence || 'ONE_OFF',
      recurrenceEndDate: toDateInput(item.recurrenceEndDate)
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
        notes: values.notes,
        paymentMethod: values.paymentMethod,
        treasuryAccountId: values.treasuryAccountId,
        agencyIsBuyer: values.agencyIsBuyer,
        supplierName: values.supplierName,
        recurrence: values.recurrence || 'ONE_OFF',
        // Une dépense ponctuelle n'a pas de fin ; une périodique sans fin court indéfiniment (null).
        recurrenceEndDate:
          values.recurrence && values.recurrence !== 'ONE_OFF' && values.recurrenceEndDate
            ? toIso(values.recurrenceEndDate)
            : null
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
      await rechargerApresMutation('expenses', true);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(apiErrorMessage(e, t('Erreur de sauvegarde de la dépense')));
    } finally {
      setSubmitting(false);
    }
  };

  const removeExpense = async (expenseId: string) => {
    setBusyActionId(`expense-${expenseId}`);
    try {
      await deleteExpense(tenantId, propertyId, expenseId);
      message.success(t('Dépense supprimée'));
      await rechargerApresMutation('expenses', true);
    } catch (e) {
      message.error(apiErrorMessage(e, t('Erreur de suppression de la dépense')));
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
      await rechargerApresMutation('loans', true);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(apiErrorMessage(e, t('Erreur de sauvegarde du crédit')));
    } finally {
      setSubmitting(false);
    }
  };

  const removeLoan = async (loanId: string) => {
    setBusyActionId(`loan-${loanId}`);
    try {
      await deleteLoan(tenantId, propertyId, loanId);
      message.success(t('Crédit supprimé'));
      await rechargerApresMutation('loans', true);
    } catch (e) {
      message.error(apiErrorMessage(e, t('Erreur de suppression du crédit')));
    } finally {
      setBusyActionId(null);
    }
  };

  const openCreateWorkProgram = () => {
    setEditingWorkProgram(null);
    workForm.resetFields();
    workForm.setFieldsValue({ currency: 'XOF', status: 'PLANNED', isCapitalized: false });
    setWorkModalOpen(true);
  };

  const openEditWorkProgram = (item: WorkProgram) => {
    setEditingWorkProgram(item);
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

  // Un programme rattaché à un chantier a son coût réel alimenté par le
  // chantier (contrat API `work-programs`) : le champ se lit, ne se saisit
  // pas, et ne part jamais dans le payload.
  const editingWorkIsSiteLinked = Boolean(editingWorkProgram?.constructionSiteId);

  const submitWorkProgram = async () => {
    try {
      const values = await workForm.validateFields();
      const payload: Record<string, unknown> = {
        title: values.title,
        description: values.description,
        estimatedCost: values.estimatedCost,
        currency: values.currency,
        plannedDate: toIso(values.plannedDate),
        completedDate: toIso(values.completedDate),
        status: values.status,
        isCapitalized: values.isCapitalized
      };
      if (!editingWorkIsSiteLinked) {
        payload.actualCost = values.actualCost;
      }
      setSubmitting(true);
      if (editingWorkProgram) {
        await updateWorkProgram(tenantId, propertyId, editingWorkProgram.id, payload);
        message.success(t('Programme de travaux mis à jour'));
      } else {
        await createWorkProgram(tenantId, propertyId, payload);
        message.success(t('Programme de travaux ajouté'));
      }
      setWorkModalOpen(false);
      await rechargerApresMutation('workPrograms', true);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(apiErrorMessage(e, t('Erreur de sauvegarde des travaux')));
    } finally {
      setSubmitting(false);
    }
  };

  const removeWorkProgram = async (programId: string) => {
    setBusyActionId(`work-${programId}`);
    try {
      await deleteWorkProgram(tenantId, propertyId, programId);
      message.success(t('Programme de travaux supprimé'));
      await rechargerApresMutation('workPrograms', true);
    } catch (e) {
      message.error(apiErrorMessage(e, t('Erreur de suppression des travaux')));
    } finally {
      setBusyActionId(null);
    }
  };

  const openCreateDocument = () => {
    documentForm.resetFields();
    documentForm.setFieldsValue({ documentType: 'OTHER' });
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
      await uploadPropertyDocument(
        tenantId,
        propertyId,
        documentFile,
        values.documentType,
        toIso(values.expirationDate)
      );
      message.success(t('Document ajouté'));
      setDocumentModalOpen(false);
      setDocumentFile(null);
      await rechargerApresMutation('documents', false);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(apiErrorMessage(e, t("Erreur lors de l'ajout du document")));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    setDeletingDocumentId(documentId);
    try {
      await deletePropertyDocument(tenantId, propertyId, documentId);
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      message.success(t('Document supprimé'));
    } catch (e) {
      message.error(apiErrorMessage(e, t('Échec de la suppression du document')));
    } finally {
      setDeletingDocumentId(null);
    }
  };

  const enChargement = (key: SectionKey) => sectionStatus[key] === undefined || sectionStatus[key] === 'loading';

  const rubriques = [
    {
      key: 'synthese',
      label: t('Synthèse'),
      children: enChargement('yieldData') ? (
        <BlocChargement />
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24}>
            {sectionErrors.yieldData ? (
              <Alert type="error" showIcon message={sectionErrors.yieldData} />
            ) : (
              <YieldCalculator
                data={yieldData}
                loading={yieldLoading}
                assumptions={yieldAssumptions}
                syncStatus={yieldSyncStatus}
                onRecalculate={handleRecalculateYield}
              />
            )}
          </Col>
          <Col xs={24}>
            <YieldProjectionChart data={yieldData?.projection ?? []} />
          </Col>
        </Row>
      )
    },
    {
      key: 'valorisations',
      label: t('Valorisations'),
      children: enChargement('valuations') ? (
        <BlocChargement />
      ) : (
        <ValuationsSection
          valuations={valuations}
          error={sectionErrors.valuations}
          busyActionId={busyActionId}
          onAdd={openCreateValuation}
          onEdit={openEditValuation}
          onDelete={removeValuation}
        />
      )
    },
    {
      key: 'depenses',
      label: t('Dépenses'),
      children: enChargement('expenses') ? (
        <BlocChargement />
      ) : (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <ExpensesSection
            expenses={expenses}
            error={sectionErrors.expenses}
            busyActionId={busyActionId}
            onAdd={openCreateExpense}
            onEdit={openEditExpense}
            onDelete={removeExpense}
          />
          {sectionErrors.expenses ? null : (
            <Alert
              type="info"
              showIcon
              message={t("Total des charges de l'année en cours : {{value}}", {
                value: formatMoney(annualExpenses, { currency: DEVISE_PATRIMOINE })
              })}
            />
          )}
        </Space>
      )
    },
    {
      key: 'credits',
      label: t('Crédits'),
      children: enChargement('loans') ? (
        <BlocChargement />
      ) : (
        <LoansSection
          loans={loans}
          error={sectionErrors.loans}
          busyActionId={busyActionId}
          onAdd={openCreateLoan}
          onEdit={openEditLoan}
          onDelete={removeLoan}
        />
      )
    },
    {
      key: 'travaux',
      label: t('Travaux'),
      children: enChargement('workPrograms') ? (
        <BlocChargement />
      ) : (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {sectionErrors.workPrograms ? null : <WorkProgramTimeline items={workPrograms} />}
          <WorksSection
            workPrograms={workPrograms}
            error={sectionErrors.workPrograms}
            busyActionId={busyActionId}
            onAdd={openCreateWorkProgram}
            onEdit={openEditWorkProgram}
            onDelete={removeWorkProgram}
          />
        </Space>
      )
    },
    {
      key: 'documents',
      label: t('Documents'),
      children: enChargement('documents') ? (
        <BlocChargement />
      ) : sectionErrors.documents ? (
        <Alert type="error" showIcon message={sectionErrors.documents} />
      ) : (
        <DocumentVault
          documents={documents}
          tenantId={tenantId}
          propertyId={propertyId}
          onDelete={handleDeleteDocument}
          deletingId={deletingDocumentId}
          searchPrefix="doc"
          extra={
            <Button type="primary" onClick={openCreateDocument}>
              {t('Ajouter')}
            </Button>
          }
        />
      )
    }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div style={{ textAlign: 'end' }}>
        <PatrimoineExportButton tenantId={tenantId} propertyId={propertyId} />
      </div>
      <Tabs destroyOnHidden activeKey={rubrique} onChange={changerRubrique} items={rubriques} />

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
              showSearch
              optionFilterProp="label"
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
              showSearch
              optionFilterProp="label"
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
          <Form.Item
            name="recurrence"
            label={t('Périodicité')}
            dependencies={['paidAt']}
            extra={t(
              "Indiquez la date d'un paiement déjà effectué : les occurrences suivantes sont déduites et alimentent le plan de trésorerie."
            )}
            rules={[
              ({ getFieldValue }) => ({
                validator: (_, value?: ExpenseRecurrence) => {
                  const paidAt = getFieldValue('paidAt') as string | undefined;
                  if (!value || value === 'ONE_OFF' || !paidAt) return Promise.resolve();
                  if (new Date(paidAt).getTime() <= Date.now() + 24 * 3600 * 1000) return Promise.resolve();
                  return Promise.reject(
                    new Error(t("La date de paiement d'une dépense périodique ne peut pas être dans le futur"))
                  );
                }
              })
            ]}
          >
            <Select options={EXPENSE_RECURRENCES.map(value => ({ value, label: expenseRecurrenceLabel(value) }))} />
          </Form.Item>
          {expenseRecurrence && expenseRecurrence !== 'ONE_OFF' ? (
            <Form.Item
              name="recurrenceEndDate"
              label={t('Date de fin')}
              dependencies={['paidAt']}
              rules={[
                ({ getFieldValue }) => ({
                  validator: (_, value?: string) => {
                    const paidAt = getFieldValue('paidAt') as string | undefined;
                    if (!value || !paidAt || value >= paidAt.slice(0, 10)) return Promise.resolve();
                    return Promise.reject(new Error(t('La date de fin doit suivre la date de paiement')));
                  }
                })
              ]}
            >
              <Input type="date" />
            </Form.Item>
          ) : null}
          <Form.Item name="isCapitalized" label={t('Capitalisée')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="receiptUrl" label={t('URL justificatif')}>
            <Input />
          </Form.Item>
          <Form.Item name="paymentMethod" label={t('Moyen de paiement')}>
            <Select
              showSearch
              optionFilterProp="label"
              onChange={() => expenseForm.setFieldsValue({ treasuryAccountId: undefined })}
              options={[
                { value: 'CASH', label: paymentMethodLabel('CASH') },
                { value: 'BANK_TRANSFER', label: paymentMethodLabel('BANK_TRANSFER') },
                { value: 'CHECK', label: paymentMethodLabel('CHECK') },
                { value: 'MOBILE_MONEY', label: paymentMethodLabel('MOBILE_MONEY') },
                { value: 'CARD', label: paymentMethodLabel('CARD') },
                { value: 'OTHER', label: paymentMethodLabel('OTHER') }
              ]}
            />
          </Form.Item>
          <Form.Item name="treasuryAccountId" label={t('Compte de trésorerie')}>
            <ExpenseTreasuryAccountField tenantId={tenantId} paymentMethod={expensePaymentMethod} />
          </Form.Item>
          <Form.Item name="agencyIsBuyer" label={t("L'agence a commandé et doit la facture")} valuePropName="checked">
            <Switch />
          </Form.Item>
          {expenseAgencyIsBuyer ? (
            <Form.Item
              name="supplierName"
              label={t('Fournisseur')}
              rules={[{ required: true, message: t('Le fournisseur est requis quand l’agence a commandé') }]}
            >
              <Input />
            </Form.Item>
          ) : null}
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
              showSearch
              optionFilterProp="label"
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
        title={editingWorkProgram ? t('Modifier programme travaux') : t('Ajouter programme travaux')}
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
          {editingWorkIsSiteLinked ? (
            <Form.Item label={t('Coût réel')}>
              <InputNumber disabled value={workForm.getFieldValue('actualCost')} style={{ width: '100%' }} />
              <Text type="secondary">
                {t('Coût réel alimenté par le chantier {{chantier}}', {
                  chantier: editingWorkProgram?.constructionSite?.name ?? ''
                })}
              </Text>
            </Form.Item>
          ) : (
            <Form.Item name="actualCost" label={t('Coût réel')}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          )}
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
              showSearch
              optionFilterProp="label"
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
          <Form.Item name="documentType" label={t('Type')} rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={documentTypeOptions()} />
          </Form.Item>
          <Form.Item name="expirationDate" label={t('Date expiration (optionnelle)')}>
            <Input type="datetime-local" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};
