import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { listOwnerAccounts } from '../../services/owner-accounts-service';
import type { OwnerAccountSummary } from '../../services/owner-accounts-service';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, MoneyValue, DataView, DataCard, StatCard } from '../../components/primitives';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';

/**
 * Comptes propriétaires — lot 3 de la gestion locative.
 *
 * Le compte courant que l'agence tient pour chaque propriétaire : ce qu'elle
 * lui doit (`balance`), son dernier mouvement, son dernier reversement.
 * Construit sur le même modèle que `pages/finance/BalanceClients.tsx` — mêmes
 * primitives, mêmes trois états délégués à `<DataView>`, pas de pagination
 * serveur puisque le contrat rend la liste entière (comme la balance
 * clients).
 *
 * Contrat : `lot3-contrat-api.md` (scratchpad de l'atelier), section 1.
 * L'API n'existe pas encore ; l'écran est codé contre le contrat et testé
 * avec un mock de `services/owner-accounts-service.ts`.
 *
 * **Le total de contrôle** ne fait la somme que des soldes POSITIFS : un
 * solde négatif est une dette du propriétaire envers l'agence, pas un montant
 * que l'agence lui doit. L'additionner aurait masqué une partie de ce que
 * l'agence doit réellement reverser derrière une compensation qui n'existe
 * pas — chaque compte reste distinct, aucun ne finance l'autre.
 */

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
}

export const ComptesProprietaires: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('owner-accounts', tenantId, {}),
    queryFn: () => listOwnerAccounts(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const comptes = data ?? [];
  const totalDu = comptes.reduce((somme, compte) => somme + Math.max(compte.balance, 0), 0);

  const ouvrirCompte = (compte: OwnerAccountSummary) =>
    navigate(`/tenant/${tenantId}/finance/owner-accounts/${compte.ownerClientId}`);

  const colonnes: ColumnsType<OwnerAccountSummary> = [
    { title: t('Propriétaire'), key: 'proprietaire', render: (_, c) => c.ownerName },
    { title: t('E-mail'), key: 'email', render: (_, c) => c.email ?? '—' },
    {
      title: t('Solde dû'),
      key: 'solde',
      align: 'end',
      render: (_, c) =>
        c.balance > 0 ? (
          <strong style={{ color: 'var(--color-warning-text)' }}>
            <MoneyValue value={c.balance} />
          </strong>
        ) : (
          <MoneyValue value={c.balance} signed />
        )
    },
    {
      title: t('Dernier mouvement'),
      key: 'dernier-mouvement',
      render: (_, c) => (c.lastMovementAt ? dateCourte(c.lastMovementAt) : '—')
    },
    {
      title: t('Dernier reversement'),
      key: 'dernier-reversement',
      render: (_, c) =>
        c.lastPayout ? (
          <span>
            {c.lastPayout.number} · <MoneyValue value={c.lastPayout.amount} /> · {dateCourte(c.lastPayout.paidAt)}
          </span>
        ) : (
          '—'
        )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, c) => (
        <Button type="link" onClick={() => ouvrirCompte(c)}>
          {t('Voir le compte')}
        </Button>
      )
    }
  ];

  return (
    <>
      <PageHeader
        title={t('Comptes propriétaires')}
        subtitle={comptes.length > 0 ? t('{{length}} propriétaire{{value}}', { length: comptes.length, value: comptes.length > 1 ? 's' : '' }) : undefined}
      />

      {data && (
        <div style={{ marginBottom: 'var(--space-6)', maxWidth: 320 }}>
          <StatCard label={t('Total dû aux propriétaires')} value={<MoneyValue value={totalDu} />} tone="warning" />
        </div>
      )}

      <DataView<OwnerAccountSummary>
        paginated={false}
        items={comptes}
        total={comptes.length}
        page={1}
        pageSize={Math.max(comptes.length, 1)}
        onPageChange={() => {}}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger les comptes propriétaires.') : null}
        onRetry={() => refetch()}
        emptyDescription={t('Aucun compte propriétaire enregistré.')}
        columns={colonnes}
        rowKey={c => c.ownerClientId}
        aria-label={t('Comptes propriétaires')}
        renderCard={c => (
          <DataCard
            title={c.ownerName}
            aria-label={c.ownerName}
            subtitle={c.email ?? undefined}
            highlight={<MoneyValue value={c.balance} signed />}
            fields={[
              {
                label: t('Dernier mouvement'),
                value: c.lastMovementAt ? dateCourte(c.lastMovementAt) : '—'
              },
              {
                label: t('Dernier reversement'),
                value: c.lastPayout ? `${c.lastPayout.number} · ${dateCourte(c.lastPayout.paidAt)}` : '—'
              }
            ]}
            onOpen={() => ouvrirCompte(c)}
          />
        )}
      />
    </>
  );
};

export default ComptesProprietaires;
