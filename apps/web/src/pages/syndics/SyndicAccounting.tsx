import React, { useCallback, useMemo, useState } from 'react';
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
  Row,
  Select,
  Space,
  Tabs,
  Typography
} from 'antd';
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { StatCard } from '../../components/primitives';
import {
  createAccountingEntry,
  createAccountingJournal,
  createChartOfAccount,
  listAccountingJournals,
  listChartOfAccounts,
  loadSyndicChartTemplate,
  lockAccountingEntry
} from '../../services/syndic-service';
import { AccountingJournal, ChartOfAccount, SourceType } from '../../types/syndic-types';
import { AccountingBalanceTab } from '../../components/syndics/accounting/AccountingBalanceTab';
import { AccountingEntriesTab } from '../../components/syndics/accounting/AccountingEntriesTab';
import { AccountingJournalsTab } from '../../components/syndics/accounting/AccountingJournalsTab';
import { AccountingLedgerTab } from '../../components/syndics/accounting/AccountingLedgerTab';
import { AccountingPlanTab } from '../../components/syndics/accounting/AccountingPlanTab';
import {
  ACCOUNT_TYPE_VALUES,
  ACCOUNTING_TABS,
  AccountingTabKey,
  DEFAULT_ACCOUNTING_TAB,
  LEDGER_PREFIX,
  UpdateParams,
  accountTypeLabel,
  accountingKey
} from '../../components/syndics/accounting/accounting-shared';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { HelpSectionTitle } from '../../help';
import { t } from '../../i18n/t';

const { Paragraph, Title } = Typography;

const sourceTypeOptions = (): Array<{ value: SourceType; label: string }> => [
  { value: 'MANUAL', label: t('MANUEL') },
  { value: 'CHARGE_PAYMENT', label: t('PAIEMENT CHARGE') },
  { value: 'PENALTY', label: t('PÉNALITÉ') },
  { value: 'FUND', label: t('FONDS') }
];

export const SyndicAccounting: React.FC = () => {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  const tenantId = effectiveTenantId ?? '';
  const ready = Boolean(effectiveTenantId && syndicId);

  const [submitting, setSubmitting] = useState(false);

  const [openAccount, setOpenAccount] = useState(false);
  const [openJournal, setOpenJournal] = useState(false);
  const [openEntry, setOpenEntry] = useState(false);

  const [accountForm] = Form.useForm();
  const [journalForm] = Form.useForm();
  const [entryForm] = Form.useForm();

  const tabParam = searchParams.get('tab');
  const activeTab: AccountingTabKey = ACCOUNTING_TABS.includes(tabParam as AccountingTabKey)
    ? (tabParam as AccountingTabKey)
    : DEFAULT_ACCOUNTING_TAB;

  const updateParams: UpdateParams = useCallback(
    patch => {
      setSearchParams(
        previous => {
          const next = new URLSearchParams(previous);
          Object.entries(patch).forEach(([key, value]) => {
            if (value === undefined || value === '') next.delete(key);
            else next.set(key, value);
          });
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Le plan comptable et la liste des journaux (bornés) sont chargés au montage : ils alimentent les
  // sélecteurs des modales, l'activation de « Nouvelle écriture » et les onglets Plan comptable / Journaux.
  // Tout le reste (écritures, grand livre, balance) ne se charge qu'à l'affichage de son onglet.
  const accountsQuery = useQuery({
    queryKey: accountingKey(tenantId, syndicId ?? '', 'plan'),
    queryFn: () => listChartOfAccounts(tenantId, syndicId as string),
    enabled: ready
  });
  const journalsQuery = useQuery({
    queryKey: accountingKey(tenantId, syndicId ?? '', 'journaux'),
    queryFn: () => listAccountingJournals(tenantId, syndicId as string),
    enabled: ready
  });
  // L'onglet Plan comptable lit aussi les comptes inactifs (le critère Actifs/Inactifs en dépend) : requête
  // distincte, chargée à l'affichage de l'onglet. Les sélecteurs de saisie restent sur les comptes actifs.
  const fullPlanQuery = useQuery({
    queryKey: accountingKey(tenantId, syndicId ?? '', 'plan-complet'),
    queryFn: () => listChartOfAccounts(tenantId, syndicId as string, { onlyActive: false }),
    enabled: ready && activeTab === 'plan'
  });
  const accounts = useMemo<ChartOfAccount[]>(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const fullPlan = useMemo<ChartOfAccount[]>(() => fullPlanQuery.data ?? [], [fullPlanQuery.data]);
  const journals = useMemo<AccountingJournal[]>(() => journalsQuery.data ?? [], [journalsQuery.data]);
  const loadError = accountsQuery.error || journalsQuery.error;

  const accountOptions = useMemo(
    () =>
      accounts.map(account => ({
        value: account.id,
        label: `${account.accountNumber} - ${account.accountName}`
      })),
    [accounts]
  );

  const journalOptions = useMemo(
    () =>
      journals.map(journal => ({
        value: journal.id,
        label: `${journal.code} - ${journal.label} (${journal.fiscalYear})`
      })),
    [journals]
  );

  /** Après une création ou un verrouillage : tous les onglets de cette copropriété sont rechargés au besoin. */
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: accountingKey(tenantId, syndicId ?? '') }),
    [queryClient, tenantId, syndicId]
  );

  // Changer d'onglet repart d'une URL propre : chaque tableau a ses critères sous son préfixe, ceux de
  // l'onglet quitté ne doivent pas rester dans le lien.
  const handleTabChange = (key: string) => {
    const next = new URLSearchParams();
    if (key !== DEFAULT_ACCOUNTING_TAB) next.set('tab', key);
    // Le compte choisi suit l'utilisateur d'un onglet « compte » à l'autre.
    const accountId = searchParams.get('accountId');
    if (key === 'grand-livre' && accountId) next.set('accountId', accountId);
    setSearchParams(next, { replace: true });
  };

  /** Balance -> grand livre du compte, en reportant la période posée sur la balance (aucune si absente). */
  const openLedgerOf = useCallback(
    (accountId: string, period: { from?: string; to?: string }) => {
      const next = new URLSearchParams();
      next.set('tab', 'grand-livre');
      next.set('accountId', accountId);
      if (period.from) next.set(`${LEDGER_PREFIX}.periodFrom`, period.from);
      if (period.to) next.set(`${LEDGER_PREFIX}.periodTo`, period.to);
      setSearchParams(next, { replace: true });
    },
    [setSearchParams]
  );

  const handleCreateAccount = async () => {
    if (!effectiveTenantId || !syndicId) return;
    const values = await accountForm.validateFields();
    setSubmitting(true);

    try {
      await createChartOfAccount(effectiveTenantId, syndicId, {
        accountNumber: values.accountNumber,
        accountName: values.accountName,
        accountClass: values.accountClass,
        accountType: values.accountType,
        isAuxiliary: values.isAuxiliary || false
      });
      message.success(t('Compte comptable créé'));
      setOpenAccount(false);
      accountForm.resetFields();
      await refresh();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Création compte impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  const runLoadChartTemplate = async () => {
    if (!effectiveTenantId || !syndicId) return;
    setSubmitting(true);
    try {
      const result = await loadSyndicChartTemplate(effectiveTenantId, syndicId);
      message.success(
        t('{{created}} compte(s) ajouté(s), {{skipped}} déjà présent(s).', {
          created: result.created,
          skipped: result.skipped
        })
      );
      await refresh();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Chargement du plan comptable impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadChartTemplate = () => {
    if (accounts.length === 0) {
      void runLoadChartTemplate();
      return;
    }
    modal.confirm({
      title: t('Charger le plan SYSCOHADA ?'),
      content: t('Seuls les comptes manquants seront ajoutés, les comptes existants ne sont pas modifiés.'),
      okText: t('Charger le plan SYSCOHADA'),
      cancelText: t('Annuler'),
      onOk: runLoadChartTemplate
    });
  };

  const handleCreateJournal = async () => {
    if (!effectiveTenantId || !syndicId) return;
    const values = await journalForm.validateFields();
    setSubmitting(true);

    try {
      await createAccountingJournal(effectiveTenantId, syndicId, values);
      message.success(t('Journal comptable créé'));
      setOpenJournal(false);
      journalForm.resetFields();
      await refresh();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Création journal impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateEntry = async () => {
    if (!effectiveTenantId || !syndicId) return;
    const values = await entryForm.validateFields();
    setSubmitting(true);

    try {
      await createAccountingEntry(effectiveTenantId, syndicId, {
        journalId: values.journalId,
        entryDate: new Date(values.entryDate).toISOString(),
        reference: values.reference,
        description: values.description,
        sourceType: values.sourceType,
        lines: (values.lines || []).map((line: any) => ({
          accountId: line.accountId,
          lotId: line.lotId || undefined,
          debit: Number(line.debit || 0),
          credit: Number(line.credit || 0),
          label: line.label
        }))
      });
      message.success(t('Écriture comptable enregistrée'));
      setOpenEntry(false);
      entryForm.resetFields();
      await refresh();
    } catch (err: any) {
      message.error(err.response?.data?.error || t("Création d'écriture impossible"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLockEntry = useCallback(
    async (entryId: string) => {
      if (!effectiveTenantId || !syndicId) return;
      setSubmitting(true);
      try {
        await lockAccountingEntry(effectiveTenantId, syndicId, entryId);
        message.success(t('Écriture verrouillée'));
        await refresh();
      } catch (err: any) {
        message.error(err.response?.data?.error || t('Verrouillage impossible'));
      } finally {
        setSubmitting(false);
      }
    },
    [effectiveTenantId, syndicId, message, refresh]
  );

  const tabProps = { tenantId, syndicId: syndicId ?? '', params: searchParams, updateParams, accounts };

  const tabItems = [
    {
      key: 'ecritures',
      label: t('Écritures comptables'),
      children: (
        <AccountingEntriesTab
          {...tabProps}
          journals={journals}
          submitting={submitting}
          onLock={entryId => void handleLockEntry(entryId)}
        />
      )
    },
    {
      key: 'grand-livre',
      label: t('Grand livre'),
      children: <AccountingLedgerTab {...tabProps} />
    },
    {
      key: 'balance',
      label: t('Balance de vérification'),
      children: <AccountingBalanceTab {...tabProps} onOpenLedger={openLedgerOf} />
    },
    {
      key: 'plan',
      label: t('Plan comptable'),
      children: (
        <AccountingPlanTab
          accounts={fullPlan}
          loading={fullPlanQuery.isLoading}
          submitting={submitting}
          onLoadTemplate={handleLoadChartTemplate}
        />
      )
    },
    {
      key: 'journaux',
      label: t('Journaux comptables'),
      children: <AccountingJournalsTab journals={journals} loading={journalsQuery.isLoading} />
    }
  ];

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Space direction="vertical" size={4}>
            <Title level={2} style={{ margin: 0 }}>
              {t('Comptabilité syndic')}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t('Plan comptable, journaux, écritures, balance et grand livre.')}
            </Paragraph>
          </Space>
          <Space wrap>
            <Button icon={<PlusOutlined />} onClick={() => setOpenAccount(true)}>
              {t('Nouveau compte')}
            </Button>
            {accounts.length > 0 ? (
              <Button icon={<DownloadOutlined />} onClick={handleLoadChartTemplate} loading={submitting}>
                {t('Charger le plan SYSCOHADA')}
              </Button>
            ) : null}
            <Button icon={<PlusOutlined />} onClick={() => setOpenJournal(true)}>
              {t('Nouveau journal')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setOpenEntry(true)}
              disabled={accounts.length < 2 || journals.length < 1}
            >
              {t('Nouvelle écriture')}
            </Button>
          </Space>
        </div>

        {!ready ? <Alert type="error" message={t('Paramètres comptabilité manquants')} showIcon /> : null}
        {loadError ? <Alert type="error" message={t('Impossible de charger la comptabilité')} showIcon /> : null}

        {ready ? (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <StatCard label={t('Comptes')} value={accounts.length} />
              </Col>
              <Col xs={24} md={12}>
                <StatCard label={t('Journaux')} value={journals.length} />
              </Col>
            </Row>

            <Card>
              <Tabs destroyOnHidden activeKey={activeTab} onChange={handleTabChange} items={tabItems} />
            </Card>
          </>
        ) : null}
      </Space>

      <Modal
        title={t('Nouveau compte comptable')}
        open={openAccount}
        onCancel={() => setOpenAccount(false)}
        onOk={() => void handleCreateAccount()}
        okText={t('Créer compte')}
        cancelText={t('Annuler')}
        confirmLoading={submitting}
      >
        <Form
          form={accountForm}
          layout="vertical"
          initialValues={{ accountType: 'ASSET', accountClass: 1, isAuxiliary: false }}
        >
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                label={t('Numéro compte')}
                name="accountNumber"
                rules={[{ required: true, message: t('Numéro obligatoire') }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={t('Classe')}
                name="accountClass"
                rules={[{ required: true, message: t('Classe obligatoire') }]}
              >
                <InputNumber min={1} max={9} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            label={t('Intitulé compte')}
            name="accountName"
            rules={[{ required: true, message: t('Intitulé obligatoire') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label={t('Type')} name="accountType" rules={[{ required: true, message: t('Type obligatoire') }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={ACCOUNT_TYPE_VALUES.map(value => ({ value, label: accountTypeLabel(value).toUpperCase() }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('Nouveau journal')}
        open={openJournal}
        onCancel={() => setOpenJournal(false)}
        onOk={() => void handleCreateJournal()}
        okText={t('Créer journal')}
        cancelText={t('Annuler')}
        confirmLoading={submitting}
      >
        <Form
          form={journalForm}
          layout="vertical"
          initialValues={{ journalType: 'GENERAL', fiscalYear: new Date().getFullYear() }}
        >
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item label={t('Code')} name="code" rules={[{ required: true, message: t('Code obligatoire') }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={t('Exercice')}
                name="fiscalYear"
                rules={[{ required: true, message: t('Exercice obligatoire') }]}
              >
                <InputNumber min={2020} max={2100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label={t('Libellé')} name="label" rules={[{ required: true, message: t('Libellé obligatoire') }]}>
            <Input />
          </Form.Item>
          <Form.Item label={t('Type journal')} name="journalType" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={[
                { value: 'GENERAL', label: t('Général') },
                { value: 'BANK', label: t('Banque') },
                { value: 'CASH', label: t('Caisse') },
                { value: 'CHARGES', label: t('Charges') }
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <HelpSectionTitle title={t('Nouvelle écriture comptable')} helpId="syndic.comptabilite.ecriture-nouvelle" />
        }
        open={openEntry}
        onCancel={() => setOpenEntry(false)}
        onOk={() => void handleCreateEntry()}
        okText={t('Créer écriture')}
        cancelText={t('Annuler')}
        confirmLoading={submitting}
        width={860}
      >
        <Form
          form={entryForm}
          layout="vertical"
          initialValues={{
            sourceType: 'MANUAL',
            lines: [
              { debit: undefined, credit: undefined, label: '' },
              { debit: undefined, credit: undefined, label: '' }
            ]
          }}
        >
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                label={t('Journal')}
                name="journalId"
                rules={[{ required: true, message: t('Journal obligatoire') }]}
              >
                <Select showSearch optionFilterProp="label" options={journalOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={t('Date écriture')}
                name="entryDate"
                rules={[{ required: true, message: t('Date obligatoire') }]}
              >
                <Input type="datetime-local" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                label={t('Référence')}
                name="reference"
                rules={[{ required: true, message: t('Référence obligatoire') }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={t('Source')}
                name="sourceType"
                rules={[{ required: true, message: t('Source obligatoire') }]}
              >
                <Select showSearch optionFilterProp="label" options={sourceTypeOptions()} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            label={t('Description')}
            name="description"
            rules={[{ required: true, message: t('Description obligatoire') }]}
          >
            <Input />
          </Form.Item>

          <Form.List name="lines">
            {(fields, { add, remove }) => (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {fields.map((field, index) => (
                  <Row gutter={12} key={field.key}>
                    <Col xs={24} md={8}>
                      <Form.Item
                        {...field}
                        label={t('Compte #{{value}}', { value: index + 1 })}
                        name={[field.name, 'accountId']}
                        rules={[{ required: true, message: t('Compte obligatoire') }]}
                      >
                        <Select showSearch optionFilterProp="label" options={accountOptions} />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={4}>
                      <Form.Item {...field} label={t('Débit')} name={[field.name, 'debit']}>
                        <InputNumber min={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={4}>
                      <Form.Item {...field} label={t('Credit')} name={[field.name, 'credit']}>
                        <InputNumber min={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={6}>
                      <Form.Item
                        {...field}
                        label={t('Libelle ligne')}
                        name={[field.name, 'label']}
                        rules={[{ required: true, message: t('Libelle obligatoire') }]}
                      >
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={2} style={{ display: 'flex', alignItems: 'center' }}>
                      <Button danger onClick={() => remove(field.name)} disabled={fields.length <= 2}>
                        X
                      </Button>
                    </Col>
                  </Row>
                ))}
                <Button onClick={() => add()} icon={<PlusOutlined />}>
                  {t('Ajouter une ligne')}
                </Button>
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>
    </>
  );
};
