import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { App, Alert, Button, Card, DatePicker, Input, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  getJournal,
  getGeneralLedger,
  getTrialBalance,
  getMandantSubledger,
  getMandantTrialBalance,
  downloadAccountingExport
} from '../../services/accounting-exports-service';
import type {
  AccountingReport,
  GeneralLedgerAccount,
  GeneralLedgerLine,
  JournalEntry,
  JournalEntryLine,
  MandantSubledgerLine,
  MandantSubledgerNatureGroup,
  MandantSubledgerOwnerGroup,
  MandantTrialBalanceRow,
  TrialBalanceLine
} from '../../services/accounting-exports-service';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, MoneyValue } from '../../components/primitives';
import { ContexteMontants, deviseParDefaut } from '../../components/primitives/MoneyValue';
import { dateFormat } from '../../i18n/format';
import { t } from '../../i18n/t';

const { RangePicker } = DatePicker;
const { Text } = Typography;

/**
 * Comptabilité — Lot 8, exports comptables (scratchpad `lot8-contrat-api.md`).
 *
 * Trois lectures en lecture seule — journal, grand livre, balance générale —
 * pour le cabinet comptable de l'agence, chacune exportable en Excel ou CSV.
 * Construit sur le modèle de `pages/finance/CommissionsAgents.tsx` : la
 * période vit dans l'URL, les tableaux imbriqués (écriture → lignes, compte →
 * mouvements) passent par un `<Table>` d'Ant Design ordinaire plutôt que par
 * `<DataView>`, qui n'expose pas cette forme groupée — exactement la même
 * réserve que documente déjà `CommissionsAgents.tsx`.
 *
 * **Comptabilité opérationnelle, pas celle des copropriétés.** L'agence gère
 * les deux, mais séparément (`pages/syndics/SyndicAccounting.tsx` pour les
 * copropriétés) : la note en tête de l'écran le rappelle, pour qu'un
 * comptable qui cherche une écriture de charges de copropriété ne la croie
 * pas absente.
 *
 * **Écrit contre le contrat, l'API n'existant pas encore.** `services/
 * accounting-exports-service.ts` porte les types gelés ; les tests
 * (`__tests__/finance/comptabilite.test.tsx`) mockent ce service.
 */

type Onglet = 'journal' | 'grand-livre' | 'balance-generale' | 'mandants';

// « Mandants » n'a pas d'unique export généré par `handleExport` : c'est un
// onglet à deux états (grand livre auxiliaire, balance auxiliaire), chacun
// avec son propre bouton d'export — voir `exporterMandantSubledger` et
// `exporterMandantTrialBalance`. Ces deux entrées ne servent donc que
// l'exhaustivité du type `Record<Onglet, …>` et ne sont jamais lues.
const REPORT_BY_ONGLET: Record<Onglet, AccountingReport> = {
  journal: 'journal',
  'grand-livre': 'general-ledger',
  'balance-generale': 'trial-balance',
  mandants: 'mandant-subledger'
};

const FALLBACK_NAME: Record<Onglet, string> = {
  journal: 'journal',
  'grand-livre': 'grand-livre',
  'balance-generale': 'balance-generale',
  mandants: 'grand-livre-auxiliaire-mandants'
};

const ONGLET_KEY = 'tab';
const FROM_KEY = 'from';
const TO_KEY = 'to';
const JOURNAL_KEY = 'journal';
const ACCOUNT_KEY = 'account';
const DATE_MANDANTS_KEY = 'date-mandants';

function debutAnneeCourante(): string {
  return dayjs().startOf('year').format('YYYY-MM-DD');
}

function aujourdHui(): string {
  return dayjs().format('YYYY-MM-DD');
}

function dateCourte(iso: string): string {
  return dayjs(iso).format(dateFormat('short'));
}

export const Comptabilite: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const onglet = (searchParams.get(ONGLET_KEY) as Onglet | null) || 'journal';
  const from = searchParams.get(FROM_KEY) || debutAnneeCourante();
  const to = searchParams.get(TO_KEY) || aujourdHui();
  const journalFiltre = searchParams.get(JOURNAL_KEY) || '';
  const compteFiltre = searchParams.get(ACCOUNT_KEY) || '';

  const [exportEnCours, setExportEnCours] = useState<string | null>(null);

  const majParametres = (next: Partial<Record<string, string | undefined>>) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      for (const [cle, valeur] of Object.entries(next)) {
        if (valeur) params.set(cle, valeur);
        else params.delete(cle);
      }
      return params;
    });
  };

  const appliquerRaccourci = (debut: dayjs.Dayjs, fin: dayjs.Dayjs) => {
    majParametres({ [FROM_KEY]: debut.format('YYYY-MM-DD'), [TO_KEY]: fin.format('YYYY-MM-DD') });
  };

  const periode = { from, to };

  const journalQuery = useQuery({
    queryKey: queryKey('accounting-journal', tenantId, { ...periode, journal: journalFiltre }),
    queryFn: () => getJournal(tenantId as string, { ...periode, journal: journalFiltre || undefined }),
    enabled: Boolean(tenantId) && onglet === 'journal',
    staleTime: STALE_TIME.list
  });

  const grandLivreQuery = useQuery({
    queryKey: queryKey('accounting-general-ledger', tenantId, { ...periode, account: compteFiltre }),
    queryFn: () => getGeneralLedger(tenantId as string, { ...periode, account: compteFiltre || undefined }),
    enabled: Boolean(tenantId) && onglet === 'grand-livre',
    staleTime: STALE_TIME.list
  });

  const balanceQuery = useQuery({
    queryKey: queryKey('accounting-trial-balance', tenantId, periode),
    queryFn: () => getTrialBalance(tenantId as string, periode),
    enabled: Boolean(tenantId) && onglet === 'balance-generale',
    staleTime: STALE_TIME.list
  });

  const dateMandants = searchParams.get(DATE_MANDANTS_KEY) || to;

  const mandantSubledgerQuery = useQuery({
    queryKey: queryKey('accounting-mandant-subledger', tenantId, periode),
    queryFn: () => getMandantSubledger(tenantId as string, periode),
    enabled: Boolean(tenantId) && onglet === 'mandants',
    staleTime: STALE_TIME.list
  });

  const mandantTrialBalanceQuery = useQuery({
    queryKey: queryKey('accounting-mandant-trial-balance', tenantId, { date: dateMandants }),
    queryFn: () => getMandantTrialBalance(tenantId as string, { date: dateMandants }),
    enabled: Boolean(tenantId) && onglet === 'mandants',
    staleTime: STALE_TIME.list
  });

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const parametresExport = (): { journal?: string; account?: string } => {
    if (onglet === 'journal') return { journal: journalFiltre || undefined };
    if (onglet === 'grand-livre') return { account: compteFiltre || undefined };
    return {};
  };

  /** Déclenche le téléchargement d'un fichier déjà reçu du serveur — factorisé pour les cinq exports de l'écran. */
  const telecharger = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const lien = window.document.createElement('a');
    lien.href = url;
    lien.download = filename;
    window.document.body.appendChild(lien);
    lien.click();
    // L'URL d'objet est révoquée APRÈS le retrait du lien : l'inverse laisse
    // au navigateur une référence vers une URL déjà libérée.
    window.document.body.removeChild(lien);
    window.URL.revokeObjectURL(url);
  };

  const handleExport = async (format: 'xlsx' | 'csv') => {
    const report = REPORT_BY_ONGLET[onglet];
    const cle = `${report}-${format}`;
    setExportEnCours(cle);
    try {
      const { blob, filename } = await downloadAccountingExport(
        tenantId,
        report,
        format,
        { ...periode, ...parametresExport() },
        `${FALLBACK_NAME[onglet]}.${format}`
      );
      telecharger(blob, filename);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('Le téléchargement a échoué.'));
    } finally {
      setExportEnCours(null);
    }
  };

  const exporterMandantSubledger = async (format: 'xlsx' | 'csv') => {
    const cle = `mandant-subledger-${format}`;
    setExportEnCours(cle);
    try {
      const { blob, filename } = await downloadAccountingExport(
        tenantId,
        'mandant-subledger',
        format,
        periode,
        `grand-livre-auxiliaire-mandants.${format}`
      );
      telecharger(blob, filename);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('Le téléchargement a échoué.'));
    } finally {
      setExportEnCours(null);
    }
  };

  const exporterMandantTrialBalance = async (format: 'xlsx' | 'csv') => {
    const cle = `mandant-trial-balance-${format}`;
    setExportEnCours(cle);
    try {
      const { blob, filename } = await downloadAccountingExport(
        tenantId,
        'mandant-trial-balance',
        format,
        { date: dateMandants },
        `balance-auxiliaire-mandants.${format}`
      );
      telecharger(blob, filename);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('Le téléchargement a échoué.'));
    } finally {
      setExportEnCours(null);
    }
  };

  const boutonsExport = (
    <Space>
      <Button
        icon={<DownloadOutlined />}
        loading={exportEnCours === `${REPORT_BY_ONGLET[onglet]}-xlsx`}
        onClick={() => handleExport('xlsx')}
      >
        {t('Exporter en Excel')}
      </Button>
      <Button
        icon={<DownloadOutlined />}
        loading={exportEnCours === `${REPORT_BY_ONGLET[onglet]}-csv`}
        onClick={() => handleExport('csv')}
      >
        {t('Exporter en CSV')}
      </Button>
    </Space>
  );

  // --- Journal ---------------------------------------------------------
  const colonnesLignesEcriture: ColumnsType<JournalEntryLine> = [
    { title: t('Compte'), key: 'compte', width: 120, render: (_, l) => l.accountNumber },
    { title: t('Intitulé'), key: 'intitule', render: (_, l) => l.accountName },
    { title: t('Libellé'), key: 'libelle', render: (_, l) => l.label },
    { title: t('Tiers'), key: 'tiers', render: (_, l) => l.thirdParty ?? '—' },
    { title: t('Nature'), key: 'nature', render: (_, l) => l.nature ?? '—' },
    { title: t('Débit'), key: 'debit', align: 'end', render: (_, l) => <MoneyValue value={l.debit} /> },
    { title: t('Crédit'), key: 'credit', align: 'end', render: (_, l) => <MoneyValue value={l.credit} /> }
  ];

  const colonnesEcritures: ColumnsType<JournalEntry> = [
    { title: t('Date'), key: 'date', width: 120, render: (_, e) => dateCourte(e.date) },
    { title: t('Journal'), key: 'journal', width: 120, render: (_, e) => e.journalCode },
    { title: t('Référence'), key: 'reference', render: (_, e) => e.reference },
    {
      title: t('Libellé'),
      key: 'libelle',
      render: (_, e) => (
        <>
          {e.description}
          {e.reversed && (
            <Tag color="orange" style={{ marginInlineStart: 'var(--space-2)' }}>
              {t('Contre-passée')}
            </Tag>
          )}
        </>
      )
    }
  ];

  const journalData = journalQuery.data;
  const ecritures = journalData?.entries ?? [];

  const ongletJournal = (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-4)'
        }}
      >
        <div style={{ minWidth: 220 }}>
          <label htmlFor="comptabilite-filtre-journal">{t('Journal')}</label>
          <Select
            id="comptabilite-filtre-journal"
            style={{ width: '100%' }}
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('Tous les journaux')}
            value={journalFiltre || undefined}
            onChange={valeur => majParametres({ [JOURNAL_KEY]: valeur })}
            options={(journalData?.journals ?? []).map(j => ({ value: j.code, label: `${j.code} — ${j.label}` }))}
          />
        </div>
        {boutonsExport}
      </div>

      {journalQuery.error ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger le journal.')}
          actions={[{ label: t('Réessayer'), onClick: () => journalQuery.refetch(), primary: true }]}
        />
      ) : journalQuery.isPending ? (
        <StateBlock variant="loading" />
      ) : ecritures.length === 0 ? (
        <StateBlock variant="empty" description={t('Aucune écriture sur cette période.')} />
      ) : (
        <Table<JournalEntry>
          dataSource={ecritures}
          columns={colonnesEcritures}
          rowKey={e => e.id}
          pagination={false}
          loading={journalQuery.isFetching && !journalQuery.isPending}
          scroll={{ x: 'max-content' }}
          aria-label={t('Journal')}
          expandable={{
            defaultExpandAllRows: true,
            expandedRowRender: e => (
              <Table<JournalEntryLine>
                dataSource={e.lines}
                columns={colonnesLignesEcriture}
                rowKey={(l, index) => `${e.id}-${index}`}
                pagination={false}
                size="small"
                aria-label={t('Lignes de l’écriture {{reference}}', { reference: e.reference })}
              />
            )
          }}
        />
      )}

      {/* Totaux débit et crédit en pied de tableau : le tableau des écritures
          n'a pas lui-même de colonnes débit/crédit — elles sont propres aux
          lignes de chaque écriture, dépliées ci-dessus — d'où ce total sous
          le tableau plutôt qu'une ligne `<Table.Summary>` mal alignée. */}
      {journalData && ecritures.length > 0 && (
        <Text type="secondary" style={{ display: 'block', marginTop: 'var(--space-3)' }}>
          {t('Total débit')} : <MoneyValue value={journalData.totals.debit} /> · {t('Total crédit')} :{' '}
          <MoneyValue value={journalData.totals.credit} />
        </Text>
      )}
    </>
  );

  // --- Grand livre -------------------------------------------------------
  const colonnesMouvements: ColumnsType<GeneralLedgerLine> = [
    { title: t('Date'), key: 'date', width: 120, render: (_, l) => dateCourte(l.date) },
    { title: t('Journal'), key: 'journal', width: 100, render: (_, l) => l.journalCode },
    { title: t('Référence'), key: 'reference', render: (_, l) => l.reference },
    { title: t('Libellé'), key: 'libelle', render: (_, l) => l.label },
    { title: t('Tiers'), key: 'tiers', render: (_, l) => l.thirdParty ?? '—' },
    { title: t('Nature'), key: 'nature', render: (_, l) => l.nature ?? '—' },
    { title: t('Débit'), key: 'debit', align: 'end', render: (_, l) => <MoneyValue value={l.debit} /> },
    { title: t('Crédit'), key: 'credit', align: 'end', render: (_, l) => <MoneyValue value={l.credit} /> },
    { title: t('Solde'), key: 'solde', align: 'end', render: (_, l) => <MoneyValue value={l.balance} signed /> }
  ];

  const blocCompte = (compte: GeneralLedgerAccount) => (
    <Card
      key={compte.accountNumber}
      title={`${compte.accountNumber} — ${compte.accountName}`}
      style={{ marginBottom: 'var(--space-4)' }}
      extra={
        <Space size="large">
          <Text type="secondary">
            {t("Solde d'ouverture")} : <MoneyValue value={compte.openingBalance} signed />
          </Text>
          <Text type="secondary">
            {t('Solde de clôture')} : <MoneyValue value={compte.closingBalance} signed />
          </Text>
        </Space>
      }
    >
      <Table<GeneralLedgerLine>
        dataSource={compte.lines}
        columns={colonnesMouvements}
        rowKey={(l, index) => `${compte.accountNumber}-${index}`}
        pagination={false}
        size="small"
        scroll={{ x: 'max-content' }}
        aria-label={t('Mouvements du compte {{compte}}', { compte: compte.accountNumber })}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={4}>
              <Text strong>{t('Total')}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1}>
              <Text strong>
                <MoneyValue value={compte.totalDebit} />
              </Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={2}>
              <Text strong>
                <MoneyValue value={compte.totalCredit} />
              </Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={3}>
              <Text strong>
                <MoneyValue value={compte.closingBalance} signed />
              </Text>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
    </Card>
  );

  const grandLivreData = grandLivreQuery.data;
  const comptes = grandLivreData?.accounts ?? [];

  const ongletGrandLivre = (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-4)'
        }}
      >
        <div style={{ minWidth: 220 }}>
          <label htmlFor="comptabilite-filtre-compte">{t('Compte')}</label>
          <Input.Search
            id="comptabilite-filtre-compte"
            allowClear
            placeholder={t('Numéro de compte')}
            defaultValue={compteFiltre}
            onSearch={valeur => majParametres({ [ACCOUNT_KEY]: valeur })}
          />
        </div>
        {boutonsExport}
      </div>

      {grandLivreQuery.error ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger le grand livre.')}
          actions={[{ label: t('Réessayer'), onClick: () => grandLivreQuery.refetch(), primary: true }]}
        />
      ) : grandLivreQuery.isPending ? (
        <StateBlock variant="loading" />
      ) : comptes.length === 0 ? (
        <StateBlock variant="empty" description={t('Aucun compte mouvementé sur cette période.')} />
      ) : (
        comptes.map(blocCompte)
      )}
    </>
  );

  // --- Balance générale ----------------------------------------------------
  const colonnesBalance: ColumnsType<TrialBalanceLine> = [
    { title: t('Compte'), key: 'compte', width: 120, render: (_, l) => l.accountNumber },
    { title: t('Intitulé'), key: 'intitule', render: (_, l) => l.accountName },
    {
      title: t("Solde d'ouverture"),
      children: [
        {
          title: t('Débit'),
          key: 'ouverture-debit',
          align: 'end',
          render: (_, l) => <MoneyValue value={l.openingDebit} />
        },
        {
          title: t('Crédit'),
          key: 'ouverture-credit',
          align: 'end',
          render: (_, l) => <MoneyValue value={l.openingCredit} />
        }
      ]
    },
    {
      title: t('Mouvements de la période'),
      children: [
        {
          title: t('Débit'),
          key: 'periode-debit',
          align: 'end',
          render: (_, l) => <MoneyValue value={l.periodDebit} />
        },
        {
          title: t('Crédit'),
          key: 'periode-credit',
          align: 'end',
          render: (_, l) => <MoneyValue value={l.periodCredit} />
        }
      ]
    },
    {
      title: t('Solde de clôture'),
      children: [
        {
          title: t('Débit'),
          key: 'cloture-debit',
          align: 'end',
          render: (_, l) => <MoneyValue value={l.closingDebit} />
        },
        {
          title: t('Crédit'),
          key: 'cloture-credit',
          align: 'end',
          render: (_, l) => <MoneyValue value={l.closingCredit} />
        }
      ]
    }
  ];

  const balanceData = balanceQuery.data;
  const lignesBalance = balanceData?.lines ?? [];

  const ongletBalance = (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>{boutonsExport}</div>

      {balanceData && !balanceData.isBalanced && (
        <Alert
          type="error"
          showIcon
          message={t("La balance n'est pas équilibrée : signalez-le à l'éditeur.")}
          style={{ marginBottom: 'var(--space-4)' }}
        />
      )}

      {balanceQuery.error ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger la balance générale.')}
          actions={[{ label: t('Réessayer'), onClick: () => balanceQuery.refetch(), primary: true }]}
        />
      ) : balanceQuery.isPending ? (
        <StateBlock variant="loading" />
      ) : lignesBalance.length === 0 ? (
        <StateBlock variant="empty" description={t('Aucune ligne dans la balance générale.')} />
      ) : (
        <Table<TrialBalanceLine>
          dataSource={lignesBalance}
          columns={colonnesBalance}
          rowKey={l => l.accountNumber}
          pagination={false}
          loading={balanceQuery.isFetching && !balanceQuery.isPending}
          scroll={{ x: 'max-content' }}
          aria-label={t('Balance générale')}
          summary={() =>
            balanceData ? (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}>
                  <Text strong>{t('Total')}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1}>
                  <Text strong>
                    <MoneyValue value={balanceData.totals.openingDebit} />
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2}>
                  <Text strong>
                    <MoneyValue value={balanceData.totals.openingCredit} />
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3}>
                  <Text strong>
                    <MoneyValue value={balanceData.totals.periodDebit} />
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4}>
                  <Text strong>
                    <MoneyValue value={balanceData.totals.periodCredit} />
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5}>
                  <Text strong>
                    <MoneyValue value={balanceData.totals.closingDebit} />
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6}>
                  <Text strong>
                    <MoneyValue value={balanceData.totals.closingCredit} />
                  </Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            ) : null
          }
        />
      )}
    </>
  );

  // --- Mandants (auxiliaire) ----------------------------------------------
  const colonnesMouvementsMandant: ColumnsType<MandantSubledgerLine> = [
    { title: t('Date'), key: 'date', width: 120, render: (_, l) => dateCourte(l.date) },
    { title: t('Journal'), key: 'journal', width: 100, render: (_, l) => l.journalCode },
    { title: t('Référence'), key: 'reference', render: (_, l) => l.reference },
    { title: t('Libellé'), key: 'libelle', render: (_, l) => l.label },
    { title: t('Débit'), key: 'debit', align: 'end', render: (_, l) => <MoneyValue value={l.debit} /> },
    { title: t('Crédit'), key: 'credit', align: 'end', render: (_, l) => <MoneyValue value={l.credit} /> },
    { title: t('Solde'), key: 'solde', align: 'end', render: (_, l) => <MoneyValue value={l.balance} signed /> }
  ];

  const blocNatureMandant = (nature: MandantSubledgerNatureGroup) => (
    <div key={nature.nature} style={{ marginBottom: 'var(--space-4)' }}>
      <Space size="large" style={{ marginBottom: 'var(--space-2)' }}>
        <Text strong>{nature.natureLabel}</Text>
        <Text type="secondary">
          {t("Solde d'ouverture")} : <MoneyValue value={nature.openingBalance} signed />
        </Text>
        <Text type="secondary">
          {t('Solde de clôture')} : <MoneyValue value={nature.closingBalance} signed />
        </Text>
      </Space>
      <Table<MandantSubledgerLine>
        dataSource={nature.lines}
        columns={colonnesMouvementsMandant}
        rowKey={(l, index) => `${nature.nature}-${index}`}
        pagination={false}
        size="small"
        scroll={{ x: 'max-content' }}
        aria-label={t('Mouvements — {{nature}}', { nature: nature.natureLabel })}
      />
    </div>
  );

  const blocProprietaireMandant = (proprietaire: MandantSubledgerOwnerGroup) => (
    <Card
      key={proprietaire.thirdPartyAccountId ?? 'non-reparti'}
      title={proprietaire.ownerLabel}
      style={{ marginBottom: 'var(--space-4)' }}
      extra={
        <Text type="secondary">
          {t('Solde de clôture')} : <MoneyValue value={proprietaire.closingBalance} signed />
        </Text>
      }
    >
      {proprietaire.natures.map(blocNatureMandant)}
    </Card>
  );

  const mandantSubledgerData = mandantSubledgerQuery.data;
  const proprietaires = mandantSubledgerData?.owners ?? [];

  const colonnesBalanceMandants: ColumnsType<MandantTrialBalanceRow> = [
    { title: t('Mandant'), key: 'mandant', render: (_, r) => r.ownerLabel },
    {
      title: t('Compte courant'),
      key: 'compte-courant',
      align: 'end',
      render: (_, r) => <MoneyValue value={r.current} signed />
    },
    {
      title: t('Dépôt de garantie'),
      key: 'depot-garantie',
      align: 'end',
      render: (_, r) => <MoneyValue value={r.deposit} signed />
    },
    {
      title: t('À affecter'),
      key: 'a-affecter',
      align: 'end',
      render: (_, r) => <MoneyValue value={r.unallocated} signed />
    },
    { title: t('Total'), key: 'total', align: 'end', render: (_, r) => <MoneyValue value={r.total} signed /> }
  ];

  const mandantTrialBalanceData = mandantTrialBalanceQuery.data;
  const lignesBalanceMandants = mandantTrialBalanceData?.rows ?? [];

  const ongletMandants = (
    <>
      <Card
        title={t('Grand livre auxiliaire des mandants')}
        style={{ marginBottom: 'var(--space-4)' }}
        extra={
          <Space>
            <Button
              icon={<DownloadOutlined />}
              loading={exportEnCours === 'mandant-subledger-xlsx'}
              onClick={() => exporterMandantSubledger('xlsx')}
            >
              {t('Exporter en Excel')}
            </Button>
            <Button
              icon={<DownloadOutlined />}
              loading={exportEnCours === 'mandant-subledger-csv'}
              onClick={() => exporterMandantSubledger('csv')}
            >
              {t('Exporter en CSV')}
            </Button>
          </Space>
        }
      >
        {mandantSubledgerData && !mandantSubledgerData.control.isBalanced && (
          <Alert
            type="error"
            showIcon
            message={t(
              "Le grand livre auxiliaire des mandants ne coïncide pas avec le solde général du compte : signalez-le à l'éditeur."
            )}
            description={t('Écart : {{montant}}', { montant: mandantSubledgerData.control.difference })}
            style={{ marginBottom: 'var(--space-4)' }}
          />
        )}
        {mandantSubledgerQuery.error ? (
          <StateBlock
            variant="error"
            description={t('Impossible de charger le grand livre auxiliaire des mandants.')}
            actions={[{ label: t('Réessayer'), onClick: () => mandantSubledgerQuery.refetch(), primary: true }]}
          />
        ) : mandantSubledgerQuery.isPending ? (
          <StateBlock variant="loading" />
        ) : proprietaires.length === 0 ? (
          <StateBlock variant="empty" description={t('Aucun mouvement de mandant sur cette période.')} />
        ) : (
          proprietaires.map(blocProprietaireMandant)
        )}
      </Card>

      <Card
        title={t('Balance auxiliaire des mandants')}
        extra={
          <Space wrap align="end">
            <div>
              <label htmlFor="comptabilite-mandants-date">{t('Date')}</label>
              <DatePicker
                id="comptabilite-mandants-date"
                format="DD/MM/YYYY"
                value={dayjs(dateMandants)}
                onChange={date => date && majParametres({ [DATE_MANDANTS_KEY]: date.format('YYYY-MM-DD') })}
                allowClear={false}
              />
            </div>
            <Button
              icon={<DownloadOutlined />}
              loading={exportEnCours === 'mandant-trial-balance-xlsx'}
              onClick={() => exporterMandantTrialBalance('xlsx')}
            >
              {t('Exporter en Excel')}
            </Button>
            <Button
              icon={<DownloadOutlined />}
              loading={exportEnCours === 'mandant-trial-balance-csv'}
              onClick={() => exporterMandantTrialBalance('csv')}
            >
              {t('Exporter en CSV')}
            </Button>
          </Space>
        }
      >
        {mandantTrialBalanceData && !mandantTrialBalanceData.control.isBalanced && (
          <Alert
            type="error"
            showIcon
            message={t(
              "La balance auxiliaire des mandants ne coïncide pas avec le solde général du compte : signalez-le à l'éditeur."
            )}
            description={t('Écart : {{montant}}', { montant: mandantTrialBalanceData.control.difference })}
            style={{ marginBottom: 'var(--space-4)' }}
          />
        )}
        {mandantTrialBalanceQuery.error ? (
          <StateBlock
            variant="error"
            description={t('Impossible de charger la balance auxiliaire des mandants.')}
            actions={[{ label: t('Réessayer'), onClick: () => mandantTrialBalanceQuery.refetch(), primary: true }]}
          />
        ) : mandantTrialBalanceQuery.isPending ? (
          <StateBlock variant="loading" />
        ) : lignesBalanceMandants.length === 0 ? (
          <StateBlock variant="empty" description={t('Aucun solde de mandant à cette date.')} />
        ) : (
          <Table<MandantTrialBalanceRow>
            dataSource={lignesBalanceMandants}
            columns={colonnesBalanceMandants}
            rowKey={r => r.thirdPartyAccountId ?? 'non-reparti'}
            pagination={false}
            loading={mandantTrialBalanceQuery.isFetching && !mandantTrialBalanceQuery.isPending}
            scroll={{ x: 'max-content' }}
            aria-label={t('Balance auxiliaire des mandants')}
            summary={() =>
              mandantTrialBalanceData ? (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <Text strong>{t('Total')}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1}>
                    <Text strong>
                      <MoneyValue value={mandantTrialBalanceData.totals.current} signed />
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2}>
                    <Text strong>
                      <MoneyValue value={mandantTrialBalanceData.totals.deposit} signed />
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3}>
                    <Text strong>
                      <MoneyValue value={mandantTrialBalanceData.totals.unallocated} signed />
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4}>
                    <Text strong>
                      <MoneyValue value={mandantTrialBalanceData.totals.total} signed />
                    </Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              ) : null
            }
          />
        )}
      </Card>
    </>
  );

  return (
    <>
      <PageHeader title={t('Comptabilité')} />

      <Text type="secondary" style={{ display: 'block', marginBottom: 'var(--space-4)' }}>
        {t(
          "Comptabilité opérationnelle de l'agence : gestion locative, fournisseurs, chantiers. Les copropriétés ont leur propre comptabilité."
        )}
      </Text>

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div>
          <label htmlFor="comptabilite-periode">{t('Période')}</label>
        </div>
        <Space wrap align="start">
          <RangePicker
            id="comptabilite-periode"
            format="DD/MM/YYYY"
            value={[dayjs(from), dayjs(to)]}
            onChange={dates => {
              if (dates && dates[0] && dates[1]) {
                majParametres({ [FROM_KEY]: dates[0].format('YYYY-MM-DD'), [TO_KEY]: dates[1].format('YYYY-MM-DD') });
              }
            }}
            allowClear={false}
          />
          <Space>
            <Button onClick={() => appliquerRaccourci(dayjs().startOf('month'), dayjs())}>{t('Mois en cours')}</Button>
            <Button
              onClick={() =>
                appliquerRaccourci(
                  dayjs().subtract(1, 'month').startOf('month'),
                  dayjs().subtract(1, 'month').endOf('month')
                )
              }
            >
              {t('Mois précédent')}
            </Button>
            <Button onClick={() => appliquerRaccourci(dayjs().startOf('year'), dayjs())}>{t('Année en cours')}</Button>
          </Space>
        </Space>
      </div>

      {/* Une colonne de montants qui répète « FCFA » à chaque ligne noie le
          chiffre : la devise se dit une fois, sous les onglets, comme dans
          les tableaux standard de l'application (voir `DataView`). */}
      <ContexteMontants.Provider value={SANS_DEVISE}>
        <Tabs
          activeKey={onglet}
          onChange={valeur => majParametres({ [ONGLET_KEY]: valeur })}
          items={[
            { key: 'journal', label: t('Journal'), children: ongletJournal },
            { key: 'grand-livre', label: t('Grand livre'), children: ongletGrandLivre },
            { key: 'balance-generale', label: t('Balance générale'), children: ongletBalance },
            { key: 'mandants', label: t('Mandants'), children: ongletMandants }
          ]}
        />
      </ContexteMontants.Provider>
      <Text type="secondary">{t('Tous les montants sont en {{devise}}.', { devise: deviseParDefaut() })}</Text>
    </>
  );
};

export default Comptabilite;

const SANS_DEVISE = { sansDevise: true, signaler: () => undefined };
