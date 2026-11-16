import React, { useCallback, useMemo } from 'react';
import { Button, Card, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined } from '@ant-design/icons';
import type { UseQueryResult } from '@tanstack/react-query';
import type {
  MandantLine,
  MandantNatureSummary,
  MandantOwnerLedgerPage,
  WithSync
} from '../../../../services/accounting-exports-service';
import { DataView, MoneyValue, StateBlock } from '../../../../components/primitives';
import { t } from '../../../../i18n/t';
import { dateCourte } from '../shared';
import { LIMITE_LIGNES } from './useMandantUrl';
import type { MajUrl } from './useMandantUrl';

const { Text } = Typography;

interface DetailMandantProps {
  query: UseQueryResult<WithSync<MandantOwnerLedgerPage>>;
  isFiltered: boolean;
  pageLignes: number;
  maj: MajUrl;
  onBack: () => void;
}

/**
 * Détail d'un propriétaire : synthèse par nature et lignes (le filtre de nature est dans la barre du cadre)
 * paginées par le serveur (le solde progressif vient du serveur).
 */
export const DetailMandant: React.FC<DetailMandantProps> = ({ query, isFiltered, pageLignes, maj, onBack }) => {
  const data = query.data;
  const statut = (query.error as { response?: { status?: number } } | null)?.response?.status;

  const columns = useMemo<ColumnsType<MandantLine>>(
    () => [
      { title: t('Date'), key: 'date', width: 120, render: (_, l) => dateCourte(l.date) },
      { title: t('Journal'), key: 'journal', width: 110, render: (_, l) => l.journalCode },
      { title: t('Pièce'), key: 'piece', render: (_, l) => l.reference },
      { title: t('Libellé'), key: 'libelle', render: (_, l) => l.label },
      { title: t('Nature'), key: 'nature', render: (_, l) => l.natureLabel },
      { title: t('Débit'), key: 'debit', align: 'end', render: (_, l) => <MoneyValue value={l.debit} /> },
      { title: t('Crédit'), key: 'credit', align: 'end', render: (_, l) => <MoneyValue value={l.credit} /> },
      { title: t('Solde'), key: 'solde', align: 'end', render: (_, l) => <MoneyValue value={l.balance} signed /> }
    ],
    []
  );

  const renderCard = useCallback(
    (ligne: MandantLine) => (
      <Card size="small" style={{ marginBlockEnd: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
          <Text strong>{ligne.reference}</Text>
          <Text type="secondary">
            {dateCourte(ligne.date)} · {ligne.journalCode}
          </Text>
        </div>
        <div>{ligne.label}</div>
        <Text type="secondary">{ligne.natureLabel}</Text>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBlockStart: 'var(--space-2)' }}>
          <span>
            {t('Débit')} : <MoneyValue value={ligne.debit} />
          </span>
          <span>
            {t('Crédit')} : <MoneyValue value={ligne.credit} />
          </span>
        </div>
        <div>
          {t('Solde')} : <MoneyValue value={ligne.balance} signed />
        </div>
      </Card>
    ),
    []
  );

  if (statut === 404) {
    return (
      <StateBlock
        variant="empty"
        title={t('Mandant introuvable')}
        description={t("Ce mandant n'existe pas ou n'appartient pas à cette agence.")}
        actions={[{ label: t('Tous les mandants'), onClick: onBack, primary: true }]}
      />
    );
  }

  const natures: MandantNatureSummary[] = data?.natures ?? [];

  return (
    <div>
      <div style={{ marginBlockEnd: 'var(--space-3)' }}>
        <Button type="link" icon={<ArrowLeftOutlined />} style={{ paddingInline: 0 }} onClick={onBack}>
          {t('Tous les mandants')}
        </Button>
      </div>
      {data && (
        <Typography.Title level={4} style={{ marginBlockStart: 0 }}>
          {data.owner.ownerLabel}
        </Typography.Title>
      )}

      {natures.length > 0 && (
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', marginBlockEnd: 'var(--space-4)' }}
          data-testid="synthese-natures"
        >
          {natures.map(n => (
            <Card key={n.nature} size="small" style={{ minWidth: 220 }} title={n.natureLabel}>
              <div>
                <Text type="secondary">{t("Solde d'ouverture")}</Text> : <MoneyValue value={n.openingBalance} signed />
              </div>
              <div>
                <Text type="secondary">{t('Solde de clôture')}</Text> : <MoneyValue value={n.closingBalance} signed />
              </div>
            </Card>
          ))}
        </div>
      )}

      <DataView<MandantLine>
        helpId="finance.mandants.detail"
        aria-label={t('Grand livre auxiliaire des mandants')}
        columns={columns}
        items={data?.items ?? []}
        total={data?.total ?? 0}
        page={pageLignes}
        pageSize={LIMITE_LIGNES}
        onPageChange={nextPage => maj({ 'page-lignes': nextPage > 1 ? String(nextPage) : undefined })}
        loading={query.isPending}
        isReloading={query.isFetching && !query.isPending}
        error={query.isError ? t('Impossible de charger le grand livre auxiliaire des mandants.') : null}
        onRetry={() => void query.refetch()}
        isFiltered={isFiltered}
        onClearFilters={() => maj({ nature: undefined, 'page-lignes': undefined })}
        emptyDescription={t('Aucun mouvement pour ce mandant sur cette période.')}
        renderCard={renderCard}
        rowKey={l => l.id}
        export={false}
      />
    </div>
  );
};
