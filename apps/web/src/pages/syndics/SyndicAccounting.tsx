import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Spin,
  Statistic,
  Table,
  Tag,
  Typography
} from 'antd';
import { ArrowLeftOutlined, LockOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  createAccountingEntry,
  createAccountingJournal,
  createChartOfAccount,
  getGeneralLedger,
  getTrialBalance,
  listAccountingEntries,
  listAccountingJournals,
  listChartOfAccounts,
  lockAccountingEntry
} from '../../services/syndic-service';
import { AccountingJournal, ChartOfAccount, JournalEntry, SourceType, TrialBalance } from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Paragraph, Title } = Typography;

const sourceTypeOptions: Array<{ value: SourceType; label: string }> = [
  { value: 'MANUAL', label: 'MANUEL' },
  { value: 'CHARGE_PAYMENT', label: t('PAIEMENT CHARGE') },
  { value: 'PENALTY', label: t('PÉNALITÉ') },
  { value: 'FUND', label: 'FONDS' }
];

const accountTypeLabels: Record<ChartOfAccount['accountType'], string> = {
  ASSET: 'Actif',
  LIABILITY: 'Passif',
  EQUITY: t('Capitaux propres'),
  INCOME: 'Produit',
  EXPENSE: 'Charge'
};

export const SyndicAccounting: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [journals, setJournals] = useState<AccountingJournal[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalance>({
    items: [],
    totals: { totalDebit: 0, totalCredit: 0, isBalanced: true }
  });
  const [ledger, setLedger] = useState<any[]>([]);

  const [openAccount, setOpenAccount] = useState(false);
  const [openJournal, setOpenJournal] = useState(false);
  const [openEntry, setOpenEntry] = useState(false);

  const [accountForm] = Form.useForm();
  const [journalForm] = Form.useForm();
  const [entryForm] = Form.useForm();

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError(t('Paramètres comptabilité manquants'));
      return;
    }
    void loadData();
  }, [effectiveTenantId, syndicId]);

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

  const loadData = async () => {
    if (!effectiveTenantId || !syndicId) return;
    setLoading(true);
    setError(null);

    try {
      const [accountsData, journalsData, entriesData, balanceData, ledgerData] = await Promise.all([
        listChartOfAccounts(effectiveTenantId, syndicId),
        listAccountingJournals(effectiveTenantId, syndicId),
        listAccountingEntries(effectiveTenantId, syndicId, { page: 1, limit: 100 }),
        getTrialBalance(effectiveTenantId, syndicId),
        getGeneralLedger(effectiveTenantId, syndicId, { page: 1, limit: 100 })
      ]);

      setAccounts(accountsData);
      setJournals(journalsData);
      setEntries(entriesData);
      setTrialBalance(balanceData);
      setLedger(ledgerData);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger la comptabilité'));
    } finally {
      setLoading(false);
    }
  };

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
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Création compte impossible'));
    } finally {
      setSubmitting(false);
    }
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
      await loadData();
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
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t("Création d'écriture impossible"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLockEntry = async (entryId: string) => {
    if (!effectiveTenantId || !syndicId) return;
    setSubmitting(true);
    try {
      await lockAccountingEntry(effectiveTenantId, syndicId, entryId);
      message.success(t('Écriture verrouillée'));
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Verrouillage impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Space direction="vertical" size={4}>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicId}`)}
            >
              {t('Retour à la fiche syndic')}
            </Button>
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

        {error ? <Alert type="error" message={error} showIcon /> : null}

        {loading ? (
          <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Card>
                  <Statistic title={t('Comptes')} value={accounts.length} />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card>
                  <Statistic title={t('Journaux')} value={journals.length} />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card>
                  <Statistic title={t('Balance équilibrée')} value={trialBalance.totals.isBalanced ? 'OUI' : 'NON'} />
                </Card>
              </Col>
            </Row>

            <Card title={t('Plan comptable')}>
              <Table
                scroll={{ x: 'max-content' }}
                rowKey="id"
                dataSource={accounts}
                pagination={{ pageSize: 10 }}
                columns={[
                  { title: t('Numéro'), dataIndex: 'accountNumber' },
                  { title: t('Intitulé'), dataIndex: 'accountName' },
                  { title: 'Classe', dataIndex: 'accountClass' },
                  {
                    title: 'Type',
                    dataIndex: 'accountType',
                    render: (value: ChartOfAccount['accountType']) => accountTypeLabels[value] || value
                  },
                  {
                    title: 'Actif',
                    render: (_, account) =>
                      account.isActive ? <Tag color="green">OUI</Tag> : <Tag color="red">NON</Tag>
                  }
                ]}
              />
            </Card>

            <Card title={t('Journaux comptables')}>
              <Table
                scroll={{ x: 'max-content' }}
                rowKey="id"
                dataSource={journals}
                pagination={{ pageSize: 10 }}
                columns={[
                  { title: 'Code', dataIndex: 'code' },
                  { title: t('Libellé'), dataIndex: 'label' },
                  { title: 'Type', dataIndex: 'journalType' },
                  { title: 'Exercice', dataIndex: 'fiscalYear' },
                  {
                    title: t('Créé le'),
                    dataIndex: 'createdAt',
                    render: (value: string) => dayjs(value).format('DD/MM/YYYY')
                  }
                ]}
              />
            </Card>

            <Card title={t('Écritures comptables')}>
              <Table
                scroll={{ x: 'max-content' }}
                rowKey="id"
                dataSource={entries}
                pagination={{ pageSize: 10 }}
                columns={[
                  {
                    title: 'Date',
                    dataIndex: 'entryDate',
                    render: (value: string) => dayjs(value).format('DD/MM/YYYY')
                  },
                  { title: t('Référence'), dataIndex: 'reference' },
                  { title: 'Description', dataIndex: 'description' },
                  {
                    title: 'Journal',
                    render: (_, entry) => entry.journal?.code || entry.journalId
                  },
                  {
                    title: 'Statut',
                    render: (_, entry) =>
                      entry.isLocked ? <Tag color="green">{t('VERROUILLÉE')}</Tag> : <Tag color="orange">OUVERTE</Tag>
                  },
                  {
                    title: 'Action',
                    render: (_, entry) =>
                      entry.isLocked ? (
                        <Tag>{t('Verrouillée')}</Tag>
                      ) : (
                        <Button
                          size="small"
                          icon={<LockOutlined />}
                          loading={submitting}
                          onClick={() => void handleLockEntry(entry.id)}
                        >
                          {t('Verrouiller')}
                        </Button>
                      )
                  }
                ]}
              />
            </Card>

            <Row gutter={[16, 16]}>
              <Col xs={24} xl={12}>
                <Card title={t('Balance de vérification')}>
                  <Table
                    scroll={{ x: 'max-content' }}
                    rowKey="accountId"
                    dataSource={trialBalance.items}
                    pagination={{ pageSize: 8 }}
                    columns={[
                      { title: 'Compte', render: (_, item) => `${item.accountNumber} - ${item.accountName}` },
                      {
                        title: t('Débit'),
                        dataIndex: 'totalDebit',
                        render: (value: number) => value.toLocaleString(activeLocale())
                      },
                      {
                        title: t('Crédit'),
                        dataIndex: 'totalCredit',
                        render: (value: number) => value.toLocaleString(activeLocale())
                      },
                      {
                        title: 'Solde',
                        dataIndex: 'balance',
                        render: (value: number) => value.toLocaleString(activeLocale())
                      }
                    ]}
                  />
                </Card>
              </Col>
              <Col xs={24} xl={12}>
                <Card title={t('Grand livre')}>
                  <Table
                    scroll={{ x: 'max-content' }}
                    rowKey="id"
                    dataSource={ledger}
                    pagination={{ pageSize: 8 }}
                    columns={[
                      { title: 'Date', render: (_, line) => dayjs(line.entry?.entryDate).format('DD/MM/YYYY') },
                      { title: 'Compte', render: (_, line) => line.account?.accountNumber || '-' },
                      { title: t('Référence'), render: (_, line) => line.entry?.reference || '-' },
                      {
                        title: t('Débit'),
                        dataIndex: 'debit',
                        render: (value: number | string) => Number(value).toLocaleString(activeLocale())
                      },
                      {
                        title: t('Crédit'),
                        dataIndex: 'credit',
                        render: (value: number | string) => Number(value).toLocaleString(activeLocale())
                      }
                    ]}
                  />
                </Card>
              </Col>
            </Row>
          </>
        )}
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
              options={[
                { value: 'ASSET', label: 'ACTIF' },
                { value: 'LIABILITY', label: 'PASSIF' },
                { value: 'EQUITY', label: t('CAPITAUX PROPRES') },
                { value: 'INCOME', label: 'PRODUIT' },
                { value: 'EXPENSE', label: 'CHARGE' }
              ]}
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
                { value: 'GENERAL', label: 'GENERAL' },
                { value: 'BANK', label: 'BANQUE' },
                { value: 'CASH', label: 'CAISSE' },
                { value: 'CHARGES', label: 'CHARGES' }
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('Nouvelle écriture comptable')}
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
                <Select showSearch optionFilterProp="label" options={sourceTypeOptions} />
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
