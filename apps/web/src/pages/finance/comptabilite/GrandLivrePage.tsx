import React, { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, Col, Row, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DataView, ListSearch, MoneyValue, StatCard, StateBlock } from '../../../components/primitives';
import { useListParams } from '../../../hooks/useListParams';
import { useListSearch } from '../../../hooks/useListSearch';
import type { SearchCriterion } from '../../../utils/list-search';
import { getAccountLedger, getLedgerSummary } from '../../../services/accounting-exports-service';
import type { AccountBalanceRow, GeneralLedgerLine } from '../../../services/accounting-exports-service';
import { t } from '../../../i18n/t';
import {
  AccountingFrame,
  ExportButtons,
  accountingQueryKey,
  dateCourte,
  useAccountingExport,
  useAccountingMeta,
  useAccountingPeriod
} from './shared';
import { SelecteurCompte } from './grand-livre/SelecteurCompte';

const { Text } = Typography;

const FILTER_KEYS = ['account', 'q', 'journal'] as const;
type GrandLivreFilters = { account: string; q: string; journal: string };
const PAGE_SUMMARY = 50;
const PAGE_ACCOUNT = 100;

const estIntrouvable = (err: unknown) => (err as { response?: { status?: number } } | null)?.response?.status === 404;

/**
 * Grand livre par compte. Sans `account` : récapitulatif paginé des comptes
 * mouvementés ; avec : synthèse, navigation entre comptes et un seul tableau
 * paginé côté serveur (soldes progressifs calculés par le serveur).
 */
export const GrandLivrePage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { from, to } = useAccountingPeriod();
  // `useListParams` ne sert qu'à CHANGER DE VUE : une seule écriture d'URL pose le compte et remet
  // critères et page à zéro. Les critères (q, journal) et la page sont ceux de `useListSearch`.
  const { filters, setFilters } = useListParams<GrandLivreFilters>({
    filterKeys: FILTER_KEYS,
    defaultPageSize: PAGE_SUMMARY
  });
  const { account = '' } = filters;
  const limit = account ? PAGE_ACCOUNT : PAGE_SUMMARY;

  const meta = useAccountingMeta(tenantId);
  const optionsJournaux = (meta.data?.journals ?? []).map(j => ({ value: j.code, label: `${j.code} — ${j.label}` }));

  // Une seule barre : sans compte, le champ libre seul ; avec un compte, le champ libre et le journal.
  // La période reste dans le cadre commun (aucun critère de dates ici).
  const criteres: SearchCriterion[] = account
    ? [
        { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Libellé ou pièce') },
        { key: 'journal', type: 'select', label: t('Journal'), primary: true, options: optionsJournaux }
      ]
    : [{ key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Numéro ou intitulé') }];
  const search = useListSearch({ criteria: criteres, defaultPageSize: PAGE_SUMMARY });
  const { page, setPage, isFiltered } = search;
  const q = (search.values.q as string | undefined) ?? '';
  const journal = (search.values.journal as string | undefined) ?? '';

  const { exportEnCours, exporter } = useAccountingExport(tenantId);

  const resume = useQuery({
    queryKey: accountingQueryKey('ledger-summary', tenantId, { from, to, page, limit, q }),
    queryFn: () => getLedgerSummary(tenantId as string, { from, to, page, limit, search: q }),
    enabled: Boolean(tenantId) && !account,
    placeholderData: keepPreviousData
  });
  const compte = useQuery({
    queryKey: accountingQueryKey('ledger-account', tenantId, { from, to, account, page, limit, q, journal }),
    queryFn: () => getAccountLedger(tenantId as string, { from, to, account, page, limit, search: q, journal }),
    enabled: Boolean(tenantId) && Boolean(account),
    placeholderData: keepPreviousData,
    retry: false
  });

  const ouvrir = useCallback(
    (numero: string) => setFilters({ account: numero, q: undefined, journal: undefined }),
    [setFilters]
  );
  const retourRecap = useCallback(
    () => setFilters({ account: undefined, q: undefined, journal: undefined }),
    [setFilters]
  );

  const colonnesResume = useMemo<ColumnsType<AccountBalanceRow>>(
    () => [
      {
        title: t('Compte'),
        key: 'compte',
        width: 130,
        render: (_, r) => (
          <Button type="link" size="small" style={{ paddingInline: 0 }} onClick={() => ouvrir(r.accountNumber)}>
            {r.accountNumber}
          </Button>
        )
      },
      { title: t('Intitulé'), key: 'intitule', render: (_, r) => r.accountName },
      {
        title: t('Ouverture'),
        key: 'ouverture',
        align: 'end',
        render: (_, r) => <MoneyValue value={r.openingBalance} signed />
      },
      { title: t('Débit'), key: 'debit', align: 'end', render: (_, r) => <MoneyValue value={r.totalDebit} /> },
      { title: t('Crédit'), key: 'credit', align: 'end', render: (_, r) => <MoneyValue value={r.totalCredit} /> },
      {
        title: t('Clôture'),
        key: 'cloture',
        align: 'end',
        render: (_, r) => <MoneyValue value={r.closingBalance} signed />
      }
    ],
    [ouvrir]
  );

  const colonnesLignes = useMemo<ColumnsType<GeneralLedgerLine>>(
    () => [
      { title: t('Date'), key: 'date', width: 110, render: (_, l) => dateCourte(l.date) },
      { title: t('Journal'), key: 'journal', width: 110, render: (_, l) => l.journalCode },
      { title: t('Pièce'), key: 'piece', render: (_, l) => l.reference },
      { title: t('Libellé'), key: 'libelle', render: (_, l) => l.label },
      { title: t('Tiers'), key: 'tiers', render: (_, l) => l.thirdParty ?? '—' },
      { title: t('Nature'), key: 'nature', render: (_, l) => l.nature ?? '—' },
      { title: t('Débit'), key: 'debit', align: 'end', render: (_, l) => <MoneyValue value={l.debit} /> },
      { title: t('Crédit'), key: 'credit', align: 'end', render: (_, l) => <MoneyValue value={l.credit} /> },
      { title: t('Solde'), key: 'solde', align: 'end', render: (_, l) => <MoneyValue value={l.balance} signed /> }
    ],
    []
  );

  const carteResume = useCallback(
    (r: AccountBalanceRow) => (
      <Card
        size="small"
        hoverable
        role="button"
        tabIndex={0}
        aria-label={`${r.accountNumber} — ${r.accountName}`}
        style={{ marginBlockEnd: 'var(--space-3)' }}
        onClick={() => ouvrir(r.accountNumber)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            ouvrir(r.accountNumber);
          }
        }}
      >
        <Text strong>
          {r.accountNumber} — {r.accountName}
        </Text>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBlockStart: 'var(--space-2)' }}>
          <span>
            {t('Débit')} : <MoneyValue value={r.totalDebit} />
          </span>
          <span>
            {t('Crédit')} : <MoneyValue value={r.totalCredit} />
          </span>
        </div>
        <div>
          {t('Clôture')} : <MoneyValue value={r.closingBalance} signed />
        </div>
      </Card>
    ),
    [ouvrir]
  );

  const carteLigne = useCallback(
    (l: GeneralLedgerLine) => (
      <Card size="small" style={{ marginBlockEnd: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
          <Text strong>{l.reference}</Text>
          <Text type="secondary">
            {dateCourte(l.date)} · {l.journalCode}
          </Text>
        </div>
        <div>{l.label}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBlockStart: 'var(--space-2)' }}>
          <span>
            {t('Débit')} : <MoneyValue value={l.debit} />
          </span>
          <span>
            {t('Crédit')} : <MoneyValue value={l.credit} />
          </span>
        </div>
        <div>
          {t('Solde')} : <MoneyValue value={l.balance} signed />
        </div>
      </Card>
    ),
    []
  );

  if (!tenantId) return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;

  const data = account ? compte.data : resume.data;
  const grandLivre = account ? compte.data : undefined;
  const recap = account ? undefined : resume.data;
  const introuvable = Boolean(account) && compte.isError && estIntrouvable(compte.error);

  const exportParams = account ? { from, to, account, search: q, journal } : q ? { from, to, search: q } : { from, to };
  const nomFichier = `${t('Grand livre')}${account ? ` ${account}` : ''}`;
  const filtres = (
    <>
      <div style={{ marginBlockEnd: 'var(--space-3)' }}>
        <SelecteurCompte
          tenantId={tenantId}
          from={from}
          to={to}
          value={account}
          currentName={grandLivre?.account.accountName}
          onChange={numero => (numero ? ouvrir(numero) : retourRecap())}
        />
      </div>
      <ListSearch {...search.searchProps} aria-label={t('Rechercher dans le grand livre')} resultCount={data?.total} />
    </>
  );

  const actions = (
    <ExportButtons
      loadingKey={exportEnCours}
      disabled={introuvable}
      onExport={format => exporter('general-ledger', format, exportParams, `${nomFichier}.${format}`)}
    />
  );

  let contenu: React.ReactNode;
  if (introuvable) {
    contenu = (
      <StateBlock
        variant="empty"
        title={t('Compte introuvable')}
        description={t('Ce compte n’existe pas dans le plan comptable de l’agence.')}
        actions={[{ label: t('Retour au récapitulatif'), onClick: retourRecap, primary: true }]}
      />
    );
  } else if (account) {
    const synthese = grandLivre?.summary;
    const precedent = grandLivre?.previousAccount ?? null;
    const suivant = grandLivre?.nextAccount ?? null;
    contenu = (
      <>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            marginBlockEnd: 'var(--space-3)'
          }}
        >
          <Text strong>
            {grandLivre ? `${grandLivre.account.accountNumber} — ${grandLivre.account.accountName}` : account}
          </Text>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Tooltip title={precedent ? `${precedent.accountNumber} — ${precedent.accountName}` : undefined}>
              <Button
                icon={<LeftOutlined />}
                disabled={!precedent}
                onClick={() => precedent && ouvrir(precedent.accountNumber)}
              >
                {t('Compte précédent')}
              </Button>
            </Tooltip>
            <Tooltip title={suivant ? `${suivant.accountNumber} — ${suivant.accountName}` : undefined}>
              <Button
                icon={<RightOutlined />}
                disabled={!suivant}
                onClick={() => suivant && ouvrir(suivant.accountNumber)}
              >
                {t('Compte suivant')}
              </Button>
            </Tooltip>
          </div>
        </div>
        {synthese && (
          <Row gutter={[16, 16]} style={{ marginBlockEnd: 'var(--space-4)' }}>
            <Col xs={12} lg={6}>
              <StatCard label={t("Solde d'ouverture")} value={<MoneyValue value={synthese.openingBalance} signed />} />
            </Col>
            <Col xs={12} lg={6}>
              <StatCard label={t('Total débit')} value={<MoneyValue value={synthese.totalDebit} />} />
            </Col>
            <Col xs={12} lg={6}>
              <StatCard label={t('Total crédit')} value={<MoneyValue value={synthese.totalCredit} />} />
            </Col>
            <Col xs={12} lg={6}>
              <StatCard
                label={t('Solde de clôture')}
                value={<MoneyValue value={synthese.closingBalance} signed />}
                highlight
              />
            </Col>
          </Row>
        )}
        <DataView<GeneralLedgerLine>
          aria-label={t('Grand livre')}
          columns={colonnesLignes}
          items={grandLivre?.items ?? []}
          total={grandLivre?.total ?? 0}
          page={page}
          pageSize={limit}
          onPageChange={nextPage => setPage(nextPage)}
          loading={compte.isPending}
          isReloading={compte.isFetching && !compte.isPending}
          error={compte.isError ? t('Impossible de charger le grand livre.') : null}
          onRetry={() => void compte.refetch()}
          isFiltered={isFiltered}
          onClearFilters={search.clear}
          emptyDescription={t('Aucun mouvement sur ce compte pour cette période.')}
          renderCard={carteLigne}
          rowKey={l => l.id}
          export={false}
        />
        {grandLivre?.filteredTotals && (
          <Text style={{ display: 'block', marginBlockStart: 'var(--space-3)' }}>
            {t('Lignes filtrées')} : {t('Total débit')} : <MoneyValue value={grandLivre.filteredTotals.debit} /> ·{' '}
            {t('Total crédit')} : <MoneyValue value={grandLivre.filteredTotals.credit} />
            <Text type="secondary" style={{ display: 'block' }}>
              {t('Le solde affiché reste celui du compte, filtres ignorés.')}
            </Text>
          </Text>
        )}
      </>
    );
  } else {
    contenu = (
      <>
        <DataView<AccountBalanceRow>
          aria-label={t('Grand livre')}
          columns={colonnesResume}
          items={recap?.items ?? []}
          total={recap?.total ?? 0}
          page={page}
          pageSize={limit}
          onPageChange={nextPage => setPage(nextPage)}
          loading={resume.isPending}
          isReloading={resume.isFetching && !resume.isPending}
          error={resume.isError ? t('Impossible de charger le grand livre.') : null}
          onRetry={() => void resume.refetch()}
          isFiltered={isFiltered}
          onClearFilters={search.clear}
          emptyDescription={t('Aucun compte mouvementé sur cette période.')}
          renderCard={carteResume}
          rowKey={r => r.id}
          export={false}
        />
        {recap && recap.items.length > 0 && (
          <Text strong style={{ display: 'block', marginBlockStart: 'var(--space-3)' }}>
            {t('Total')} : {t('Débit')} <MoneyValue value={recap.totals.totalDebit} /> · {t('Crédit')}{' '}
            <MoneyValue value={recap.totals.totalCredit} /> · {t('Clôture')}{' '}
            <MoneyValue value={recap.totals.closingBalance} signed />
          </Text>
        )}
      </>
    );
  }

  return (
    <AccountingFrame sync={data?.sync} filters={filtres} actions={actions}>
      {contenu}
    </AccountingFrame>
  );
};

export default GrandLivrePage;
