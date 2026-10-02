import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Button, Select, Tabs, Modal, Drawer } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listPayments,
  listLeases,
  createPayment,
  allocatePayment,
  RentalPayment,
  RentalPaymentStatus,
  RentalPaymentMethod,
  CreatePaymentRequest,
  AllocatePaymentRequest
} from '../../services/rental-service';
import { PaymentForm } from '../../components/rental/PaymentForm';
import { AllocatePaymentForm } from '../../components/rental/AllocatePaymentForm';
import { PaymentDeclarationsList } from '../../components/rental/PaymentDeclarationsList';
import { OnlineCheckoutStatus } from '../../components/rental/OnlineCheckoutStatus';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useListParams } from '../../hooks/useListParams';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { nomDuBien, nomDeLaPersonne, optionsLocatairesDesBaux, deviseAffichee } from '../../lib/rental-labels';
import {
  PageHeader,
  StateBlock,
  StatusTag,
  MoneyValue,
  DataView,
  DataCard,
  FilterSheet,
  formatMoney
} from '../../components/primitives';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
/**
 * Paiements — quatrième des six écrans hybrides (§9.7).
 *
 * Défauts corrigés, chacun avec son test :
 *
 * **Le calcul du montant affecté était écrit deux fois, à l'identique.** Deux
 * colonnes le recalculaient chacune de leur côté, à partir des allocations et
 * des mouvements de dépôt. Deux copies d'une règle financière finissent par
 * diverger, et la divergence ne se voit qu'en les comparant. Il n'y en a plus
 * qu'une.
 *
 * **Affecter un paiement quittait l'écran.** L'allocation réussie renvoyait
 * vers la liste globale des échéances — y compris depuis l'onglet d'un bail,
 * d'où l'on se retrouvait ailleurs sans l'avoir demandé. On reste, et la liste
 * se met à jour.
 *
 * **Sept colonnes derrière `scroll={{ x: 'max-content' }}`**, des formulaires
 * ouverts en pleine page qui poussaient la liste hors de l'écran, et une action
 * en icône seule sans nom accessible.
 *
 * `handleStatusChange`, défini et jamais appelé, est retiré.
 */

interface PaymentsProps {
  /** Fourni quand l'écran est monté en onglet d'un bail. */
  leaseId?: string;
}

type Filters = { status: string; onglet: string; renterClientId: string };
const FILTER_KEYS = ['status', 'onglet', 'renterClientId'] as const;

const METHOD_LABELS: Record<string, string> = {
  CASH: t('Espèces'),
  BANK_TRANSFER: t('Virement bancaire'),
  CHECK: t('Chèque'),
  MOBILE_MONEY: t('Mobile Money'),
  CARD: t('Carte bancaire'),
  OTHER: 'Autre'
};

const STATUS_OPTIONS = [
  { value: 'PENDING', label: t('En attente') },
  { value: 'SUCCESS', label: t('Réussi') },
  { value: 'FAILED', label: t('Échoué') },
  { value: 'CANCELED', label: t('Annulé') }
];

/**
 * Montant déjà affecté d'un paiement.
 *
 * Un paiement se répartit entre des échéances et des mouvements de dépôt de
 * garantie. Les deux comptent : ne sommer que les allocations ferait apparaître
 * comme « non affecté » un paiement entièrement versé au dépôt.
 */
function montantAffecte(paiement: RentalPayment): number {
  const versEcheances = paiement.allocations?.reduce((somme, a) => somme + Number(a.amount || 0), 0) || 0;
  const versDepot = paiement.depositMovements?.reduce((somme, m) => somme + Number(m.amount || 0), 0) || 0;
  return versEcheances + versDepot;
}

function resteAAffecter(paiement: RentalPayment): number {
  // Un paiement échoué ou annulé n'a encaissé aucun argent : rien à affecter (BUG-2026-10-02-017).
  if (paiement.status === 'FAILED' || paiement.status === 'CANCELED') return 0;
  return Number(paiement.amount || 0) - montantAffecte(paiement);
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
}

export const Payments: React.FC<PaymentsProps> = ({ leaseId: propLeaseId }) => {
  const { message } = App.useApp();
  const { tenantId, leaseId: paramLeaseId } = useParams<{ tenantId: string; leaseId?: string }>();
  const leaseId = propLeaseId || paramLeaseId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isDesktop } = useBreakpoint();

  const list = useListParams<Filters>({ filterKeys: FILTER_KEYS, defaultPageSize: 50 });
  const [saisieOuverte, setSaisieOuverte] = useState(false);
  const [affectePour, setAffectePour] = useState<RentalPayment | null>(null);

  const onglet = list.filters.onglet || 'paiements';

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('payments', tenantId, {
      status: list.filters.status ?? '',
      renterClientId: list.filters.renterClientId ?? '',
      leaseId: leaseId ?? '',
      page: list.page,
      limit: list.pageSize
    }),
    queryFn: () =>
      listPayments(tenantId as string, {
        leaseId,
        status: (list.filters.status as RentalPaymentStatus) || undefined,
        renterClientId: list.filters.renterClientId || undefined,
        page: list.page,
        limit: list.pageSize
      }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  /**
   * Locataires du portefeuille, pour le filtre.
   *
   * Dérivés des baux et non des paiements affichés : un locataire qui n'a
   * encore rien versé doit rester sélectionnable, ne serait-ce que pour
   * constater qu'il n'a rien versé.
   *
   * Inutile dans l'onglet d'un bail : le payeur y est déjà unique.
   */
  const { data: tousLesBaux } = useQuery({
    queryKey: queryKey('leases', tenantId, { pour: 'filtre-locataire' }),
    queryFn: () => listLeases(tenantId as string, { limit: 500 }),
    enabled: Boolean(tenantId) && !leaseId,
    staleTime: STALE_TIME.list
  });

  const optionsLocataires = React.useMemo(() => optionsLocatairesDesBaux(tousLesBaux?.data), [tousLesBaux]);

  const paiements = data?.data ?? [];
  const total = data?.pagination?.total ?? 0;

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ['payments', tenantId] });

  const handleCreate = async (donnees: CreatePaymentRequest) => {
    if (!tenantId) return;
    // Les erreurs remontent au formulaire, qui les affiche lui-même.
    await createPayment(tenantId, donnees);
    setSaisieOuverte(false);
    await rafraichir();
    message.success(t('Paiement enregistré.'));
  };

  const handleAllocate = async (donnees: AllocatePaymentRequest) => {
    if (!tenantId || !affectePour) return;
    await allocatePayment(tenantId, affectePour.id, donnees);
    setAffectePour(null);
    // On reste sur l'écran. L'ancienne version renvoyait vers la liste globale
    // des échéances, y compris depuis l'onglet d'un bail : on se retrouvait
    // ailleurs sans l'avoir demandé, et il fallait revenir pour affecter le
    // paiement suivant.
    await Promise.all([rafraichir(), queryClient.invalidateQueries({ queryKey: ['installments', tenantId] })]);
    message.success(t('Paiement affecté.'));
  };

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const colonnes: ColumnsType<RentalPayment> = [
    // Dans l'onglet d'un bail, ces deux colonnes répéteraient la même valeur
    // sur chaque ligne.
    ...(leaseId
      ? []
      : [
          {
            title: t('Bail'),
            key: 'bail',
            width: 250,
            render: (_: unknown, p: RentalPayment) => (
              <>
                <div style={{ fontWeight: 600 }}>{p.lease?.lease_number || '—'}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  {nomDuBien(p.lease?.property)}
                </div>
              </>
            )
          },
          {
            title: t('Locataire'),
            key: 'locataire',
            width: 170,
            render: (_: unknown, p: RentalPayment) =>
              nomDeLaPersonne(p.renterClient?.user ?? p.lease?.primaryRenter?.user)
          }
        ]),
    { title: t('Date'), key: 'date', render: (_, p) => dateCourte(p.initiated_at) },
    {
      title: t('Montant'),
      key: 'montant',
      align: 'end',
      render: (_, p) => <MoneyValue value={p.amount} currency={deviseAffichee(p.currency)} />
    },
    {
      title: t('Reste à affecter'),
      key: 'reste',
      align: 'end',
      render: (_, p) => {
        const reste = resteAAffecter(p);
        return reste > 0 ? (
          <MoneyValue value={reste} currency={deviseAffichee(p.currency)} />
        ) : (
          // Un paiement entièrement affecté n'a pas besoin d'un « 0 » :
          // le mot dit la même chose et se lit plus vite.
          <span style={{ color: 'var(--text-secondary)' }}>{t('Affecté')}</span>
        );
      }
    },
    { title: t('Méthode'), key: 'methode', render: (_, p) => METHOD_LABELS[p.method] || p.method },
    { title: t('Statut'), key: 'statut', render: (_, p) => <StatusTag status={p.status} /> },
    {
      title: t('En ligne'),
      key: 'en-ligne',
      render: (_, p) =>
        p.onlineCheckout ? (
          <OnlineCheckoutStatus
            compact
            tenantId={tenantId as string}
            paymentId={p.id}
            checkout={p.onlineCheckout}
            onChecked={() => rafraichir()}
          />
        ) : null
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, p) => (
        <>
          <Button type="link" onClick={() => navigate(`/tenant/${tenantId}/rental/payments/${p.id}`)}>
            {t('Voir')}
          </Button>
          {resteAAffecter(p) > 0 && (
            <Button type="primary" onClick={() => setAffectePour(p)}>
              {t('Affecter')}
            </Button>
          )}
        </>
      )
    }
  ];

  const listeDesPaiements = (
    <>
      <FilterSheet
        activeCount={[list.filters.status, list.filters.renterClientId].filter(Boolean).length}
        onClear={() => list.setFilters({ status: undefined, renterClientId: undefined })}
        title={t('Filtrer les paiements')}
      >
        {!leaseId && (
          <div style={{ minWidth: 240 }}>
            <label htmlFor="filtre-locataire-paiement">{t('Locataire')}</label>
            <Select
              id="filtre-locataire-paiement"
              style={{ width: '100%' }}
              placeholder={t('Tous les locataires')}
              allowClear
              showSearch
              optionFilterProp="label"
              value={list.filters.renterClientId || undefined}
              onChange={valeur => list.setFilters({ renterClientId: valeur })}
              options={optionsLocataires}
            />
          </div>
        )}
        <div style={{ minWidth: 220 }}>
          <label htmlFor="filtre-statut-paiement">{t('Statut')}</label>
          <Select
            showSearch
            optionFilterProp="label"
            id="filtre-statut-paiement"
            style={{ width: '100%' }}
            placeholder={t('Tous les statuts')}
            allowClear
            value={list.filters.status || undefined}
            onChange={valeur => list.setFilters({ status: valeur })}
            options={STATUS_OPTIONS}
          />
        </div>
      </FilterSheet>

      <DataView<RentalPayment>
        // Neuf colonnes hors onglet de bail — le bail et le locataire s'ajoutent
        // aux sept d'origine. Elles ne tiennent pas dans les ~690 px utiles au
        // plancher du desktop.
        scrollX={leaseId ? undefined : 1320}
        items={paiements}
        total={total}
        page={list.page}
        pageSize={list.pageSize}
        onPageChange={(page, taille) => (taille !== list.pageSize ? list.setPageSize(taille) : list.setPage(page))}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger les paiements.') : null}
        onRetry={() => refetch()}
        isFiltered={Boolean(list.filters.status)}
        onClearFilters={() => list.setFilters({ status: undefined })}
        emptyDescription={t('Aucun paiement enregistré.')}
        emptyAction={{ label: t('Enregistrer un paiement'), onClick: () => setSaisieOuverte(true) }}
        columns={colonnes}
        rowKey={p => p.id}
        aria-label={t('Paiements')}
        renderCard={p => {
          const reste = resteAAffecter(p);
          return (
            <DataCard
              title={<MoneyValue value={p.amount} currency={deviseAffichee(p.currency)} />}
              aria-label={t('Paiement du {{value}}', { value: dateCourte(p.initiated_at) })}
              subtitle={`${dateCourte(p.initiated_at)} · ${METHOD_LABELS[p.method as RentalPaymentMethod] || p.method}`}
              status={<StatusTag status={p.status} />}
              fields={[
                ...(reste > 0
                  ? [
                      {
                        label: t('Déjà affecté'),
                        value: <MoneyValue value={montantAffecte(p)} currency={deviseAffichee(p.currency)} />
                      },
                      {
                        label: t('Reste à affecter'),
                        value: <MoneyValue value={reste} currency={deviseAffichee(p.currency)} />
                      }
                    ]
                  : [{ label: t('Affectation'), value: t('Intégralement affecté') }]),
                ...(p.onlineCheckout
                  ? [
                      {
                        label: t('En ligne'),
                        value: (
                          <OnlineCheckoutStatus
                            compact
                            tenantId={tenantId as string}
                            paymentId={p.id}
                            checkout={p.onlineCheckout}
                            onChecked={() => rafraichir()}
                          />
                        )
                      }
                    ]
                  : [])
              ]}
              onOpen={() => navigate(`/tenant/${tenantId}/rental/payments/${p.id}`)}
              primaryAction={reste > 0 ? { label: t('Affecter'), onClick: () => setAffectePour(p) } : undefined}
            />
          );
        }}
      />
    </>
  );

  /** Modale au-dessus de 992 px, feuille pleine hauteur en dessous (§10.1). */
  const boite = (ouvert: boolean, titre: string, fermer: () => void, contenu: React.ReactNode) =>
    isDesktop ? (
      <Modal open={ouvert} title={titre} onCancel={fermer} footer={null} width={720} destroyOnHidden>
        {contenu}
      </Modal>
    ) : (
      <Drawer open={ouvert} title={titre} onClose={fermer} placement="bottom" height="92%" destroyOnHidden>
        {contenu}
      </Drawer>
    );

  return (
    <>
      <PageHeader
        title={t('Paiements')}
        subtitle={total > 0 ? `${total} paiement${total > 1 ? 's' : ''}` : undefined}
        primaryAction={{
          label: t('Nouveau paiement'),
          icon: <PlusOutlined />,
          onClick: () => setSaisieOuverte(true)
        }}
      />

      <Tabs
        activeKey={onglet}
        // L'onglet actif vit dans l'URL : revenir depuis le détail d'un
        // paiement retrouve l'onglet d'où l'on venait, et un lien vers les
        // déclarations en attente est partageable.
        onChange={cle => list.setFilters({ onglet: cle === 'paiements' ? undefined : cle })}
        items={[
          { key: 'paiements', label: t('Paiements'), children: listeDesPaiements },
          {
            key: 'declarations',
            label: t('Déclarations en attente'),
            children: (
              <PaymentDeclarationsList
                tenantId={tenantId}
                leaseId={leaseId}
                onApproveSuccess={() => void rafraichir()}
              />
            )
          }
        ]}
      />

      {boite(
        saisieOuverte,
        t('Nouveau paiement'),
        () => setSaisieOuverte(false),
        <PaymentForm
          tenantId={tenantId}
          leaseId={leaseId}
          onSubmit={handleCreate}
          onCancel={() => setSaisieOuverte(false)}
        />
      )}

      {boite(
        Boolean(affectePour),
        affectePour
          ? t('Affecter {{value}}', {
              value: formatMoney(affectePour.amount, { currency: deviseAffichee(affectePour.currency) })
            })
          : '',
        () => setAffectePour(null),
        affectePour ? (
          <AllocatePaymentForm
            tenantId={tenantId}
            payment={affectePour}
            onSubmit={handleAllocate}
            onCancel={() => setAffectePour(null)}
          />
        ) : null
      )}
    </>
  );
};
