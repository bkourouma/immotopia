import React, { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Button, Select, Space, Modal, Drawer } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ThunderboltOutlined, CreditCardOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listInstallments,
  generateInstallments,
  recalculateInstallmentStatuses,
  deleteAllInstallments,
  createPayment,
  allocatePayment,
  calculatePenalties,
  RentalInstallment,
  RentalInstallmentStatus,
  RentalPaymentMethod,
  CreatePaymentRequest
} from '../../services/rental-service';
import { PaymentForm } from '../../components/rental/PaymentForm';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useListParams } from '../../hooks/useListParams';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import {
  PageHeader,
  StateBlock,
  StatusTag,
  MoneyValue,
  DataView,
  DataCard,
  FilterSheet,
  useConfirmAction
} from '../../components/primitives';

/**
 * Échéances — l'écran « Encaisser », deuxième des six écrans hybrides (§9.7).
 *
 * C'est l'écran le plus utilisé du parcours terrain : le §10.2 en fait le KPI
 * n°3, « temps d'encaissement d'un loyer, cible < 60 s ». Il cumulait pourtant
 * les défauts que le Lot 2 doit traiter.
 *
 * **Huit colonnes derrière un `scroll={{ x: 900 }}`.** Sous 900 px, la moitié
 * du tableau — dont « Reste à payer » et les actions — n'était atteignable qu'en
 * faisant glisser le tableau. Ce geste ne se découvre pas. `<DataView>` rend des
 * cartes sous 992 px, et le reste à payer y figure en tête.
 *
 * **Quatre requêtes au montage**, là où le §10.1 en autorise trois : un
 * chargement, puis un recalcul de statuts, un calcul de pénalités, et un second
 * chargement. Les deux effets se déclenchaient indépendamment. Le flux est
 * désormais unique.
 *
 * **Une modale faite à la main en Tailwind**, `fixed inset-0 bg-black`, sans
 * piège de focus ni fermeture au clavier. Remplacée par un `<Drawer>` pleine
 * hauteur sous 992 px et une `<Modal>` au-dessus.
 *
 * **Une clé d'idempotence qui n'en était pas une** : elle contenait
 * `Date.now()`, donc chaque envoi en produisait une nouvelle. Deux envois du
 * même encaissement créaient deux paiements — le risque R6 du §11.1, classé
 * critique. La clé est maintenant fixée à l'intention, pas à l'envoi.
 */

interface InstallmentsProps {
  /** Fourni quand l'écran est monté en onglet d'un bail. */
  leaseId?: string;
}

type Filters = { status: string; overdue: string };
const FILTER_KEYS = ['status', 'overdue'] as const;

const STATUS_OPTIONS = [
  { value: 'DUE', label: 'À échoir' },
  { value: 'PARTIAL', label: 'Partiel' },
  { value: 'PAID', label: 'Payé' },
  { value: 'OVERDUE', label: 'En retard' }
];

/** Montant dû : loyer, charges, autres frais et pénalités. */
function totalDu(echeance: RentalInstallment): number {
  return (
    Number(echeance.amount_rent || 0) +
    Number(echeance.amount_service || 0) +
    Number(echeance.amount_other_fees || 0) +
    Number(echeance.penalty_amount || 0)
  );
}

function resteAPayer(echeance: RentalInstallment): number {
  return totalDu(echeance) - Number(echeance.amount_paid || 0);
}

function periode(echeance: RentalInstallment): string {
  return `${String(echeance.period_month).padStart(2, '0')}/${echeance.period_year}`;
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}

export const Installments: React.FC<InstallmentsProps> = ({ leaseId: propLeaseId }) => {
  const { message } = App.useApp();
  const { tenantId, leaseId: paramLeaseId } = useParams<{ tenantId: string; leaseId?: string }>();
  const leaseId = propLeaseId || paramLeaseId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirmAction = useConfirmAction();
  const { isDesktop } = useBreakpoint();

  const list = useListParams<Filters>({ filterKeys: FILTER_KEYS, defaultPageSize: 50 });
  const [enCours, setEnCours] = useState<string | null>(null);
  const [formulairePour, setFormulairePour] = useState<RentalInstallment | null>(null);
  const [action, setAction] = useState<'generer' | 'recalculer' | 'supprimer' | null>(null);

  /**
   * Clés d'idempotence, une par intention d'encaissement.
   *
   * Le §8.5 l'exige : « clé générée côté client **à la saisie**, pas à l'envoi ».
   * L'ancienne version concaténait `Date.now()`, ce qui produisait une clé neuve
   * à chaque tentative : un double appui, ou un renvoi après une réponse perdue,
   * créait un second paiement. La clé est ici créée au premier appui et
   * conservée jusqu'à ce que l'encaissement aboutisse.
   */
  const clesIdempotence = useRef(new Map<string, string>());

  function cleIdempotence(installmentId: string): string {
    const existante = clesIdempotence.current.get(installmentId);
    if (existante) return existante;
    const nouvelle =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${installmentId}-${Math.random().toString(36).slice(2)}`;
    clesIdempotence.current.set(installmentId, nouvelle);
    return nouvelle;
  }

  const filtresApi = {
    leaseId,
    status: (list.filters.status as RentalInstallmentStatus) || undefined,
    overdue: list.filters.overdue === 'true' ? true : undefined,
    page: list.page,
    limit: list.pageSize
  };

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('installments', tenantId, { ...list.queryParams, leaseId: leaseId ?? '' }),
    queryFn: () => listInstallments(tenantId as string, filtresApi),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const echeances = data?.data ?? [];
  const total = data?.pagination?.total ?? 0;

  /** Invalide toutes les échéances de l'agence, quels que soient filtres et page. */
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ['installments', tenantId] });

  const handleGenerate = async () => {
    if (!tenantId || !leaseId) return;
    setAction('generer');
    try {
      await generateInstallments(tenantId, leaseId);
      await rafraichir();
      message.success('Échéances générées.');
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'La génération a échoué.');
    } finally {
      setAction(null);
    }
  };

  /**
   * Recalcul explicite, déclenché par l'utilisateur.
   *
   * L'ancienne version le lançait AUSSI automatiquement au montage, sans le
   * dire. Deux écritures en base — statuts puis pénalités — partaient à chaque
   * affichage de l'écran, y compris quand il est monté en onglet et remonté à
   * chaque aller-retour. Elles ne partent plus que sur demande.
   */
  const handleRecalculate = async () => {
    if (!tenantId || !leaseId) return;
    setAction('recalculer');
    try {
      await recalculateInstallmentStatuses(tenantId, leaseId);
      await calculatePenalties(tenantId);
      await rafraichir();
      message.success('Statuts et pénalités recalculés.');
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Le recalcul a échoué.');
    } finally {
      setAction(null);
    }
  };

  const handleDeleteAll = () => {
    if (!tenantId || !leaseId) return;
    confirmAction({
      title: 'Supprimer toutes les échéances de ce bail ?',
      description: 'Cette action est irréversible.',
      okText: 'Supprimer',
      danger: true,
      onConfirm: async () => {
        setAction('supprimer');
        try {
          await deleteAllInstallments(tenantId, leaseId);
          await rafraichir();
          message.success('Échéances supprimées.');
        } catch (err: any) {
          message.error(err?.response?.data?.message || 'La suppression a échoué.');
        } finally {
          setAction(null);
        }
      }
    });
  };

  /** Encaissement du reste dû, en espèces, à la date du jour. */
  const handleQuickPayment = async (echeance: RentalInstallment) => {
    if (!tenantId) return;
    const reste = resteAPayer(echeance);
    if (reste <= 0) {
      message.info('Cette échéance est déjà soldée.');
      return;
    }

    setEnCours(echeance.id);
    try {
      const paiement = await createPayment(tenantId, {
        leaseId: echeance.lease_id,
        method: RentalPaymentMethod.CASH,
        amount: reste,
        currency: echeance.currency,
        idempotencyKey: cleIdempotence(echeance.id)
      });

      if (paiement.success && paiement.data) {
        await allocatePayment(tenantId, paiement.data.id, { installmentIds: [echeance.id] });
        // L'intention est aboutie : la clé ne doit plus être réutilisée, sinon
        // un encaissement ultérieur du même bien serait rejeté comme doublon.
        clesIdempotence.current.delete(echeance.id);
        await rafraichir();
        message.success('Encaissement enregistré.');
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || "L'encaissement a échoué.");
    } finally {
      setEnCours(null);
    }
  };

  const handleCreatePayment = async (donnees: CreatePaymentRequest) => {
    if (!tenantId || !formulairePour) return;
    const echeance = formulairePour;
    try {
      const paiement = await createPayment(tenantId, {
        ...donnees,
        leaseId: echeance.lease_id,
        idempotencyKey: donnees.idempotencyKey || cleIdempotence(echeance.id)
      });

      if (paiement.success && paiement.data) {
        await allocatePayment(tenantId, paiement.data.id, { installmentIds: [echeance.id] });
        clesIdempotence.current.delete(echeance.id);
        setFormulairePour(null);
        await rafraichir();
        message.success('Paiement enregistré.');
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || "L'enregistrement du paiement a échoué.");
      throw err;
    }
  };

  if (!tenantId) {
    return <StateBlock variant="empty" title="Aucune agence sélectionnée" />;
  }

  /**
   * Colonnes, au-dessus de 992 px.
   *
   * Elles tiennent sans défilement horizontal parce qu'elles sont moins
   * nombreuses : « Payé » et « Pénalités » sortent du tableau. Le reste à payer
   * les résume, et le détail de l'échéance les porte toutes les deux.
   */
  const colonnes: ColumnsType<RentalInstallment> = [
    { title: 'Période', key: 'periode', render: (_, e) => periode(e) },
    { title: 'Échéance', key: 'due', render: (_, e) => dateCourte(e.due_date) },
    {
      title: 'Montant dû',
      key: 'du',
      align: 'right',
      render: (_, e) => <MoneyValue value={totalDu(e)} currency={e.currency} />
    },
    {
      title: 'Reste à payer',
      key: 'reste',
      align: 'right',
      render: (_, e) => <MoneyValue value={resteAPayer(e)} currency={e.currency} />
    },
    { title: 'Statut', key: 'statut', render: (_, e) => <StatusTag status={e.status} /> },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right',
      render: (_, e) => {
        if (resteAPayer(e) <= 0) {
          return (
            <Button type="link" onClick={() => navigate(`/tenant/${tenantId}/rental/installments/${e.id}`)}>
              Voir
            </Button>
          );
        }
        return (
          <Space>
            <Button
              icon={<ThunderboltOutlined />}
              loading={enCours === e.id}
              onClick={() => handleQuickPayment(e)}
              // Le libellé dit ce qui va se passer : espèces, montant restant,
              // aujourd'hui. « Paiement rapide » ne le disait pas.
              title="Encaisser le reste dû en espèces, à la date du jour"
            >
              Encaisser
            </Button>
            <Button type="primary" icon={<CreditCardOutlined />} onClick={() => setFormulairePour(e)}>
              Paiement…
            </Button>
          </Space>
        );
      }
    }
  ];

  const enTete = (
    <PageHeader
      title="Échéances"
      subtitle={total > 0 ? `${total} échéance${total > 1 ? 's' : ''}` : undefined}
      primaryAction={
        leaseId
          ? {
              label: 'Générer les échéances',
              icon: <PlusOutlined />,
              onClick: handleGenerate,
              loading: action === 'generer'
            }
          : undefined
      }
      secondaryActions={
        leaseId
          ? [
              { key: 'recalc', label: 'Recalculer les statuts et pénalités', onClick: handleRecalculate },
              { type: 'divider' },
              { key: 'del', label: 'Supprimer toutes les échéances', danger: true, onClick: handleDeleteAll }
            ]
          : undefined
      }
    />
  );

  const formulaire = formulairePour && (
    <PaymentForm
      tenantId={tenantId}
      leaseId={formulairePour.lease_id}
      defaultAmount={resteAPayer(formulairePour) > 0 ? resteAPayer(formulairePour) : undefined}
      defaultCurrency={formulairePour.currency}
      onSubmit={handleCreatePayment}
      onCancel={() => setFormulairePour(null)}
    />
  );

  const titreFormulaire = formulairePour
    ? `Paiement · échéance ${periode(formulairePour)} du ${dateCourte(formulairePour.due_date)}`
    : '';

  return (
    <>
      {enTete}

      <FilterSheet
        activeCount={Object.keys(list.filters).length}
        onClear={list.clearFilters}
        title="Filtrer les échéances"
      >
        <div style={{ minWidth: 200 }}>
          <label htmlFor="filtre-statut-echeance">Statut</label>
          <Select
            id="filtre-statut-echeance"
            style={{ width: '100%' }}
            placeholder="Tous les statuts"
            allowClear
            value={list.filters.status || undefined}
            onChange={value => list.setFilters({ status: value })}
            options={STATUS_OPTIONS}
          />
        </div>
        <div style={{ minWidth: 200 }}>
          <label htmlFor="filtre-retard">Retard</label>
          <Select
            id="filtre-retard"
            style={{ width: '100%' }}
            placeholder="Toutes"
            allowClear
            value={list.filters.overdue || undefined}
            onChange={value => list.setFilters({ overdue: value })}
            options={[{ value: 'true', label: 'En retard uniquement' }]}
          />
        </div>
      </FilterSheet>

      <DataView<RentalInstallment>
        items={echeances}
        total={total}
        page={list.page}
        pageSize={list.pageSize}
        onPageChange={(page, size) => (size !== list.pageSize ? list.setPageSize(size) : list.setPage(page))}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? 'Impossible de charger les échéances.' : null}
        onRetry={() => refetch()}
        isFiltered={list.isFiltered}
        onClearFilters={list.clearFilters}
        emptyDescription={
          leaseId
            ? 'Aucune échéance pour ce bail. Générez-les depuis l’action ci-dessus.'
            : 'Aucune échéance enregistrée.'
        }
        columns={colonnes}
        rowKey={e => e.id}
        aria-label="Échéances"
        renderCard={e => {
          const reste = resteAPayer(e);
          const solde = reste <= 0;
          return (
            <DataCard
              title={`Échéance ${periode(e)}`}
              aria-label={`Échéance ${periode(e)}`}
              subtitle={`À payer le ${dateCourte(e.due_date)}`}
              status={<StatusTag status={e.status} />}
              // Le reste à payer est LA donnée de cet écran : elle passe en
              // tête de carte, alors qu'elle était la cinquième colonne d'un
              // tableau qui défilait. Sur une échéance soldée, elle disparaît :
              // « 0 GNF » en gros occuperait la place la plus visible de la
              // carte pour ne rien dire, quand l'étiquette « Payé » le dit déjà.
              highlight={solde ? undefined : <MoneyValue value={reste} currency={e.currency} />}
              fields={[
                { label: 'Montant dû', value: <MoneyValue value={totalDu(e)} currency={e.currency} /> },
                { label: 'Déjà payé', value: <MoneyValue value={e.amount_paid} currency={e.currency} /> },
                ...(Number(e.penalty_amount) > 0
                  ? [{ label: 'Pénalités', value: <MoneyValue value={e.penalty_amount} currency={e.currency} /> }]
                  : [])
              ]}
              onOpen={() => navigate(`/tenant/${tenantId}/rental/installments/${e.id}`)}
              primaryAction={
                solde
                  ? undefined
                  : {
                      label: 'Encaisser',
                      icon: <ThunderboltOutlined />,
                      loading: enCours === e.id,
                      onClick: () => handleQuickPayment(e)
                    }
              }
              secondaryActions={
                solde ? undefined : [{ key: 'form', label: 'Paiement détaillé…', onClick: () => setFormulairePour(e) }]
              }
            />
          );
        }}
      />

      {/* Sous 992 px, le formulaire occupe la hauteur de l'écran plutôt qu'une
          boîte flottante : le §10.1 impose une page pleine dès quatre champs.
          `<FormSheet>` du Lot 3 remplacera ces deux formes par une seule. */}
      {isDesktop ? (
        <Modal
          open={Boolean(formulairePour)}
          onCancel={() => setFormulairePour(null)}
          title={titreFormulaire}
          footer={null}
          width={720}
          destroyOnHidden
        >
          {formulaire}
        </Modal>
      ) : (
        <Drawer
          open={Boolean(formulairePour)}
          onClose={() => setFormulairePour(null)}
          title={titreFormulaire}
          placement="bottom"
          height="92%"
          destroyOnHidden
        >
          {formulaire}
        </Drawer>
      )}
    </>
  );
};
