import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Typography,
  Spin,
  Alert,
  Tag,
  Button,
  Space,
  Statistic,
  Modal,
  Descriptions,
  Empty,
  Tabs,
  Collapse
} from 'antd';
import { DollarOutlined, CalendarOutlined, EyeOutlined, PlusOutlined, CreditCardOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { tenantPortalService } from '../../services/tenantPortalService';
import InstallmentDetails from '../../components/TenantPortal/InstallmentDetails';
import PaymentDeclarationModal from '../../components/TenantPortal/PaymentDeclarationModal';
import dayjs from 'dayjs';
import { useAuth } from '../../hooks/useAuth';
import { getMyStatement } from '../../services/finance-service';
import type { ThirdPartyMovementLine } from '../../types/finance-types';
import { natureLabel } from '../finance/Releve';
import { MoneyValue, StateBlock, SkeletonTable, Table } from '../../components/primitives';
import { collectAllPages } from '../../utils/table-export/collect';
import { useEcheancesSearch, useHistoriqueSearch, useOngletPaiements, useReleveSearch } from './search/paymentsSearch';
import { useSelectionEcheances } from './search/useSelectionEcheances';
import {
  OnlineCheckout,
  OnlineCheckoutConflict,
  createOnlinePaymentCheckout,
  getOnlinePaymentAvailability,
  getOnlinePaymentCheckout
} from '../../services/payment-gateway-service';
import { redirectToExternalUrl } from '../../utils/external-redirect';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
import { formatMontantLocatif } from '../../lib/rental-labels';
const { Title, Text } = Typography;

interface InstallmentItem {
  id: string;
  /** Bail de l'échéance : plusieurs baux actifs possibles (BUG-2026-11-04-049). */
  leaseId?: string;
  leaseNumber?: string | null;
  period: string;
  dueDate: string;
  amount: number;
  paid: number;
  balance: number;
  status: string;
  items: any[];
  payments: any[];
}

interface InstallmentsData {
  installments: InstallmentItem[];
  summary: {
    total: number;
    paid: number;
    due: number;
    overdue: number;
    partial: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Onglet « Mon relevé » — Récit 6 du spec, tâche 1.15 du plan.
 *
 * Le même document que celui que verrait la gestionnaire pour ce compte
 * (`pages/finance/Releve.tsx`), mais en LECTURE SEULE : aucun bouton
 * d'impression, aucune action, et surtout aucun moyen d'atteindre le compte
 * d'un autre locataire — `getMyStatement` ne prend aucun identifiant de
 * compte, la session résout seule le locataire. `tenantClient` ne sert ici
 * qu'à distinguer un profil non encore relié à un bail (état vide).
 *
 * `natureLabel` est réimporté de l'écran agence plutôt que redéfini ici :
 * les deux surfaces doivent afficher exactement le même vocabulaire (P-1), et
 * une seule table de correspondance ne peut pas diverger d'elle-même.
 */
function MonReleve() {
  const { tenantClient } = useAuth();
  const tenantId = tenantClient?.tenantId;

  // Aucun identifiant de compte n'est passe ici, et c'est deliberé : la route
  // du portail resout le locataire depuis sa session. Le compte de tiers
  // porte son propre identifiant, distinct de celui du `TenantClient` ; les
  // confondre ne trouverait rien, et exposer l'un ou l'autre a l'ecran
  // ouvrirait la porte au releve du voisin.
  const {
    data: releve,
    isPending,
    error,
    refetch
  } = useQuery({
    queryKey: ['account-statement', 'portail', tenantId],
    queryFn: () => getMyStatement(),
    enabled: Boolean(tenantId)
  });
  const local = useReleveSearch(releve?.movements);

  if (!tenantId) {
    return (
      <StateBlock
        variant="empty"
        title={t('Aucun compte rattaché')}
        description={t("Votre profil n'est pas encore relié à un compte locataire.")}
      />
    );
  }

  if (isPending) {
    return <SkeletonTable rows={6} columns={6} aria-label={t('Relevé en cours de chargement')} />;
  }

  if (error) {
    return (
      <StateBlock
        variant="error"
        description={t('Impossible de charger votre relevé.')}
        actions={[{ label: t('Réessayer'), onClick: () => void refetch(), primary: true }]}
      />
    );
  }

  const mouvements = releve?.movements ?? [];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label={t('Compte')}>{releve?.label}</Descriptions.Item>
          <Descriptions.Item label={t("Solde d'ouverture")}>
            <MoneyValue value={releve?.openingBalance} />
          </Descriptions.Item>
          <Descriptions.Item label={t('Solde de clôture')}>
            <MoneyValue value={releve?.closingBalance} />
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {mouvements.length === 0 ? (
        <Empty description={t('Aucun mouvement enregistré.')} />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table
            {...local.tableProps}
            exportFilename={t('Mon relevé')}
            rowKey="id"
            scroll={{ x: 800 }}
            columns={[
              {
                title: t('Date'),
                key: 'date',
                render: (_: unknown, m: ThirdPartyMovementLine) =>
                  new Date(m.movementDate).toLocaleDateString(activeLocale())
              },
              {
                title: t('Nature'),
                key: 'nature',
                render: (_: unknown, m: ThirdPartyMovementLine) => natureLabel(m.type)
              },
              { title: t('Libellé'), dataIndex: 'label', key: 'libelle' },
              {
                title: t('Facturé'),
                key: 'facture',
                align: 'end' as const,
                exportValue: (m: ThirdPartyMovementLine) => m.amountBilled,
                render: (_: unknown, m: ThirdPartyMovementLine) => <MoneyValue value={m.amountBilled} />
              },
              {
                title: t('Réglé'),
                key: 'regle',
                align: 'end' as const,
                exportValue: (m: ThirdPartyMovementLine) => m.amountSettled,
                render: (_: unknown, m: ThirdPartyMovementLine) => <MoneyValue value={m.amountSettled} />
              },
              {
                title: t('Solde après'),
                key: 'solde',
                align: 'end' as const,
                exportValue: (m: ThirdPartyMovementLine) => m.balanceAfter,
                render: (_: unknown, m: ThirdPartyMovementLine) => <MoneyValue value={m.balanceAfter} />
              }
            ]}
          />
        </div>
      )}
    </Space>
  );
}

/** Intervalle et délai maximal du suivi de retour — contrat Lot 7 §3.3. */
const SUIVI_INTERVALLE_MS = 3_000;
const SUIVI_DELAI_MAX_MS = 60_000;

function libelleStatutRetour(status: OnlineCheckout['status']): {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
} {
  switch (status) {
    case 'SUCCESS':
      return { type: 'success', message: t('Paiement confirmé.') };
    case 'FAILED':
      return { type: 'error', message: t('Le paiement a échoué.') };
    case 'CANCELED':
      return { type: 'warning', message: t('Le paiement a été annulé.') };
    case 'EXPIRED':
      return { type: 'warning', message: t('Le délai de paiement a expiré.') };
    case 'REVIEW':
      return { type: 'info', message: t('En cours de vérification par l’agence.') };
    default:
      return { type: 'info', message: t('En cours de confirmation…') };
  }
}

/**
 * Bandeau de suivi du retour depuis PaySecureHub — `?paiement=<code>`.
 *
 * Interroge `GET .../online-payments/:codePaiement` toutes les 3 s tant que le
 * statut reste `PENDING`, 60 s au plus (contrat §3.3). `onResolved` retire le
 * paramètre de l'adresse une fois un état définitif atteint (ou le délai
 * écoulé) ; `codePaiement` vient d'un état local capturé une seule fois au
 * montage, pas de l'adresse en direct, pour que ce bandeau reste affiché après
 * ce retrait.
 */
function SuiviPaiementEnLigne({
  codePaiement,
  onResolved,
  onSuccess
}: {
  codePaiement: string;
  onResolved: () => void;
  onSuccess: () => void;
}) {
  const [checkout, setCheckout] = useState<OnlineCheckout | null>(null);
  const [expire, setExpire] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const debutRef = useRef(Date.now());
  const minuteurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const traiteRef = useRef(false);

  useEffect(() => {
    let annule = false;

    const verifier = async () => {
      try {
        const donnees = await getOnlinePaymentCheckout(codePaiement);
        if (annule) return;
        setCheckout(donnees);
        if (donnees.status === 'PENDING') {
          if (Date.now() - debutRef.current >= SUIVI_DELAI_MAX_MS) {
            setExpire(true);
            if (!traiteRef.current) {
              traiteRef.current = true;
              onResolved();
            }
            return;
          }
          minuteurRef.current = setTimeout(() => void verifier(), SUIVI_INTERVALLE_MS);
        } else if (!traiteRef.current) {
          traiteRef.current = true;
          onResolved();
          if (donnees.status === 'SUCCESS') onSuccess();
        }
      } catch (e: any) {
        if (annule) return;
        setErreur(e?.response?.data?.message || t('Impossible de vérifier ce paiement.'));
        if (!traiteRef.current) {
          traiteRef.current = true;
          onResolved();
        }
      }
    };

    void verifier();
    return () => {
      annule = true;
      if (minuteurRef.current) clearTimeout(minuteurRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codePaiement]);

  if (erreur) {
    return (
      <Alert type="error" showIcon closable message={t('Erreur')} description={erreur} style={{ marginBottom: 16 }} />
    );
  }

  if (checkout?.status === 'PENDING' && expire) {
    return (
      <Alert
        type="info"
        showIcon
        closable
        message={t('En cours de confirmation…')}
        description={t(
          'Le paiement met plus de temps que prévu à se confirmer. Il apparaîtra automatiquement dans votre historique dès sa confirmation.'
        )}
        style={{ marginBottom: 16 }}
      />
    );
  }

  if (!checkout || checkout.status === 'PENDING') {
    return (
      <Alert
        type="info"
        showIcon
        message={t('Vérification du paiement en cours…')}
        icon={<Spin size="small" />}
        style={{ marginBottom: 16 }}
      />
    );
  }

  const { type, message } = libelleStatutRetour(checkout.status);
  return (
    <Alert
      type={type}
      showIcon
      closable
      message={message}
      description={checkout.status === 'FAILED' && checkout.failureMessage ? checkout.failureMessage : undefined}
      style={{ marginBottom: 16 }}
    />
  );
}

export default function TenantPayments() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { ongletActif, ongletRef, changerOnglet } = useOngletPaiements();
  // Capturé une seule fois au montage : le bandeau de suivi reste affiché même
  // après que `onResolved` a retiré `paiement` de l'adresse.
  const [paiementCode] = useState<string | null>(() => searchParams.get('paiement'));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InstallmentsData | null>(null);
  const [selectedInstallment, setSelectedInstallment] = useState<string | null>(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [declarationModalVisible, setDeclarationModalVisible] = useState(false);
  // Echeance visee quand la declaration est lancee depuis une ligne du tableau.
  const [declarationFor, setDeclarationFor] = useState<InstallmentItem | null>(null);
  // Une barre de recherche par onglet (préfixes `ech` et `his`), voir `search/paymentsSearch`.
  const echSearch = useEcheancesSearch();
  const hisSearch = useHistoriqueSearch();
  // Ignore la réponse d'une requête dépassée par une plus récente (frappes successives).
  const requeteEcheances = useRef(0);
  const requeteHistorique = useRef(0);

  // Paiement en ligne (Lot 7) : disponibilité, échéances choisies, création du checkout.
  const { data: availability } = useQuery({
    queryKey: ['online-payment-availability'],
    queryFn: () => getOnlinePaymentAvailability(),
    staleTime: 60_000,
    retry: false
  });
  const selection = useSelectionEcheances(echSearch.filterParams, data?.installments);
  const selectedInstallmentIds = selection.ids;
  // La sélection survit à la pagination : retenir le bail des lignes déjà visitées
  // pour empêcher un paiement groupé sur des baux différents.
  const [leaseByInstallmentId, setLeaseByInstallmentId] = useState<Record<string, string>>({});
  useEffect(() => {
    setLeaseByInstallmentId(previous => {
      let changed = false;
      const next = { ...previous };
      for (const installment of data?.installments ?? []) {
        if (installment.leaseId && next[installment.id] !== installment.leaseId) {
          next[installment.id] = installment.leaseId;
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [data?.installments]);
  const [payingOnline, setPayingOnline] = useState(false);

  // Plusieurs baux actifs : le numéro de bail est affiché sur chaque échéance.
  const { data: leases } = useQuery({
    queryKey: ['tenant-portal-leases'],
    queryFn: async () => {
      const response = await tenantPortalService.getLeases();
      return (response.data?.data ?? []) as Array<{ id: string; leaseNumber: string }>;
    },
    staleTime: 60_000,
    retry: false
  });
  const hasSeveralLeases = (leases?.length ?? 0) > 1;

  // Payment history state
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [paymentHistoryError, setPaymentHistoryError] = useState<string | null>(null);
  const [paymentHistoryData, setPaymentHistoryData] = useState<any>(null);

  const loadRef = useRef<{
    loadInstallments: (silencieux?: boolean) => void;
    loadPaymentHistory: (silencieux?: boolean) => void;
  } | null>(null);
  /** Horodatage de la dernière revalidation, pour le délai de garde ci-dessous. */
  const derniereRevalidation = useRef(Date.now());

  /**
   * @param silencieux Revalidation en arrière-plan : la donnée affichée reste
   *   à l'écran, sans repasser par le squelette.
   */
  const loadInstallments = async (silencieux = false) => {
    const numero = ++requeteEcheances.current;
    try {
      if (!silencieux) setLoading(true);
      setError(null);

      const response = await tenantPortalService.getInstallments(echSearch.apiParams);
      if (numero !== requeteEcheances.current) return;
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      } else {
        setError(t('Erreur lors du chargement des échéances'));
      }
    } catch (err: any) {
      if (numero !== requeteEcheances.current) return;
      setError(err.response?.data?.message || t('Erreur lors du chargement des échéances'));
    } finally {
      if (numero === requeteEcheances.current) setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => formatMontantLocatif(amount);

  const formatDate = (dateString: string) => {
    return dayjs(dateString).format('DD/MM/YYYY');
  };

  /**
   * Seules les échéances exigibles se paient : ni brouillon (pas encore
   * facturée), ni annulée, ni soldée.
   */
  const isPayable = (record: InstallmentItem) =>
    ['DUE', 'OVERDUE', 'PARTIAL'].includes(record.status) && record.balance > 0;

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      PAID: { label: t('Payé'), color: 'success' },
      DUE: { label: t('Dû'), color: 'warning' },
      OVERDUE: { label: t('En retard'), color: 'error' },
      PARTIAL: { label: t('Partiel'), color: 'processing' },
      DRAFT: { label: t('Brouillon'), color: 'default' },
      CANCELED: { label: t('Annulé'), color: 'default' }
    };
    const config = statusMap[status] || { label: status, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  const handleViewDetails = (installmentId: string) => {
    setSelectedInstallment(installmentId);
    setDetailsModalVisible(true);
  };

  const handleCloseDetails = () => {
    setDetailsModalVisible(false);
    setSelectedInstallment(null);
  };

  /** @param silencieux Voir `loadInstallments`. */
  const loadPaymentHistory = async (silencieux = false) => {
    const numero = ++requeteHistorique.current;
    try {
      if (!silencieux) setPaymentHistoryLoading(true);
      setPaymentHistoryError(null);

      const response = await tenantPortalService.getPaymentHistory(hisSearch.apiParams);
      if (numero !== requeteHistorique.current) return;
      if (response.data?.success && response.data?.data) {
        setPaymentHistoryData(response.data.data);
      } else {
        setPaymentHistoryError(t("Erreur lors du chargement de l'historique"));
      }
    } catch (err: any) {
      if (numero !== requeteHistorique.current) return;
      setPaymentHistoryError(err.response?.data?.message || t("Erreur lors du chargement de l'historique"));
    } finally {
      if (numero === requeteHistorique.current) setPaymentHistoryLoading(false);
    }
  };

  loadRef.current = { loadInstallments, loadPaymentHistory };

  /** Recharge la seule liste affichée ; l'autre se recharge à l'ouverture de son onglet. */
  const rechargerListeAffichee = (silencieux = false) => {
    if (ongletRef.current === 'echeances') void loadRef.current?.loadInstallments(silencieux);
    else if (ongletRef.current === 'historique') void loadRef.current?.loadPaymentHistory(silencieux);
  };

  /**
   * Crée le checkout PaySecureHub pour les échéances choisies, puis redirige
   * vers la page hébergée de l'agrégateur (contrat §3.3).
   *
   * Un 409 signale qu'un checkout `PENDING` de moins de 15 minutes couvre déjà
   * l'une des échéances : on reprend ce checkout au lieu d'en ouvrir un autre,
   * plutôt que de montrer une erreur.
   */
  const handlePayOnline = async () => {
    if (selectedInstallmentIds.length === 0) return;
    setPayingOnline(true);
    setError(null);
    try {
      const checkout = await createOnlinePaymentCheckout(selectedInstallmentIds);
      if (checkout.checkoutUrl) {
        redirectToExternalUrl(checkout.checkoutUrl);
        return;
      }
      setError(t("Le paiement en ligne n'a pas pu être initié."));
    } catch (err: any) {
      if (err?.response?.status === 409 && err.response?.data?.data?.checkoutUrl) {
        const conflit = err.response.data.data as OnlineCheckoutConflict;
        redirectToExternalUrl(conflit.checkoutUrl as string);
        return;
      }
      setError(err?.response?.data?.message || t('Erreur lors de la création du paiement en ligne'));
    } finally {
      setPayingOnline(false);
    }
  };

  // Chaque liste ne se charge que lorsque son onglet est affiché.
  useEffect(() => {
    if (ongletActif !== 'echeances') return;
    loadInstallments();
  }, [ongletActif, echSearch.apiParams]);

  useEffect(() => {
    if (ongletActif !== 'historique') return;
    loadPaymentHistory();
  }, [ongletActif, hisSearch.apiParams]);

  /**
   * Retour sur l'onglet : revalidation en arrière-plan (REFONTE_UI_UX.md §8.4).
   *
   * Deux corrections par rapport à l'ancienne version :
   *
   * 1. **Le chargement est silencieux.** Il posait `loading = true`, ce qui
   *    renvoyait l'écran à son squelette à chaque retour d'onglet : la mise en
   *    page sautait et le lecteur perdait sa ligne, pour une donnée qui la
   *    plupart du temps n'avait pas changé.
   * 2. **Un délai de garde.** L'événement se déclenche à chaque va-et-vient
   *    entre onglets ou applications. Sans ce seuil, consulter une notification
   *    et revenir relançait deux requêtes complètes. Trente secondes, la même
   *    fraîcheur que `STALE_TIME.list`.
   */
  useEffect(() => {
    const REVALIDATION_MIN_MS = 30_000;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const maintenant = Date.now();
      if (maintenant - derniereRevalidation.current < REVALIDATION_MIN_MS) return;
      derniereRevalidation.current = maintenant;
      rechargerListeAffichee(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      CASH: t('Espèces'),
      BANK_TRANSFER: t('Virement bancaire'),
      MOBILE_MONEY: t('Mobile Money'),
      DIRECT_DEBIT: t('Prélèvement bancaire'),
      CHECK: t('Chèque'),
      CARD: t('Carte bancaire'),
      OTHER: t('Autre')
    };
    return labels[method] || method;
  };

  const columns = [
    {
      title: t('Période'),
      dataIndex: 'period',
      key: 'period',
      width: 110,
      render: (period: string) => <Text strong>{period}</Text>
    },
    ...(hasSeveralLeases
      ? [
          {
            title: t('Bail'),
            dataIndex: 'leaseNumber',
            key: 'leaseNumber',
            width: 140,
            render: (leaseNumber: string | null | undefined) => <Text>{leaseNumber ?? '-'}</Text>
          }
        ]
      : []),
    {
      title: t("Date d'échéance"),
      dataIndex: 'dueDate',
      key: 'dueDate',
      width: 160,
      render: (date: string) => (
        <Space>
          <CalendarOutlined />
          {formatDate(date)}
        </Space>
      )
    },
    {
      title: t('Montant total'),
      dataIndex: 'amount',
      key: 'amount',
      width: 150,
      render: (amount: number) => <Text strong>{formatCurrency(amount)}</Text>
    },
    {
      title: t('Payé'),
      dataIndex: 'paid',
      key: 'paid',
      width: 130,
      render: (paid: number) => formatCurrency(paid)
    },
    {
      title: t('Solde'),
      dataIndex: 'balance',
      key: 'balance',
      width: 140,
      render: (balance: number) => <Text type={balance > 0 ? 'danger' : 'success'}>{formatCurrency(balance)}</Text>
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => getStatusTag(status)
    },
    {
      title: t('Actions'),
      key: 'actions',
      width: 190,
      render: (_: any, record: InstallmentItem) => (
        <Space>
          {isPayable(record) && (
            <Button
              type="primary"
              size="small"
              icon={<DollarOutlined />}
              onClick={() => {
                setDeclarationFor(record);
                setDeclarationModalVisible(true);
              }}
            >
              {t('Payer')}
            </Button>
          )}
          <Button type="link" icon={<EyeOutlined />} onClick={() => handleViewDetails(record.id)}>
            {t('Détails')}
          </Button>
        </Space>
      )
    }
  ];

  const selectedLeaseId = selectedInstallmentIds
    .map(id => leaseByInstallmentId[id] ?? data?.installments.find(item => item.id === id)?.leaseId)
    .find((id): id is string => Boolean(id));
  const totalSelectionOnline = selection.total;

  if (ongletActif === 'echeances' && loading && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip={t('Chargement des échéances...')} />
      </div>
    );
  }

  if (ongletActif === 'echeances' && error && !data) {
    return <Alert message={t('Erreur')} description={error} type="error" showIcon />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {paiementCode ? (
        <SuiviPaiementEnLigne
          codePaiement={paiementCode}
          onResolved={() =>
            setSearchParams(
              precedent => {
                const suivant = new URLSearchParams(precedent);
                suivant.delete('paiement');
                return suivant;
              },
              { replace: true }
            )
          }
          onSuccess={() => rechargerListeAffichee()}
        />
      ) : null}

      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          // Sur un ecran etroit le titre et le bouton se chevauchaient : on
          // autorise le passage a la ligne plutot que la compression.
          flexWrap: 'wrap',
          gap: 16
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Title level={2} style={{ marginBottom: 4 }}>
            {t('Paiements et échéances')}
          </Title>
          <Text type="secondary">{t("Suivez vos échéances et l'historique de vos paiements")}</Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setDeclarationFor(null);
            setDeclarationModalVisible(true);
          }}
        >
          {t('Déclarer un paiement')}
        </Button>
      </div>

      {/* Summary Cards (T054) */}
      {ongletActif === 'echeances' && data?.summary && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title={t('Total échéances')} value={data.summary.total} prefix={<DollarOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title={t('Payées')}
                value={data.summary.paid}
                valueStyle={{ color: '#3f8600' }}
                prefix={<DollarOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title={t('En attente')}
                value={data.summary.due}
                valueStyle={{ color: '#faad14' }}
                prefix={<DollarOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title={t('En retard')}
                value={data.summary.overdue}
                valueStyle={{ color: '#cf1322' }}
                prefix={<DollarOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Tabs for Installments and Payment History */}
      <Tabs
        activeKey={ongletActif}
        onChange={changerOnglet}
        destroyOnHidden
        items={[
          {
            key: 'echeances',
            label: t('Échéances'),
            children: (
              <Card
                title={
                  <>
                    <DollarOutlined /> {t('Liste des échéances')}
                  </>
                }
              >
                {availability?.available ? (
                  <Space direction="vertical" size="small" style={{ width: '100%', marginBottom: 16 }}>
                    {availability.mode === 'SIMULATOR' ? (
                      <Alert type="info" showIcon message={t('Mode démonstration')} />
                    ) : null}
                    <div className="it-toolbar__actions" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                      <Space direction="vertical" size={0}>
                        <Text>
                          {selectedInstallmentIds.length > 0
                            ? t('Total à payer : {{value}}', { value: formatCurrency(totalSelectionOnline) })
                            : t('Sélectionnez une ou plusieurs échéances à régler en ligne.')}
                        </Text>
                        {selectedInstallmentIds.length > 0 ? (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {t('{{count}} échéance(s) sélectionnée(s)', { count: selection.count })}
                          </Text>
                        ) : null}
                        {selection.limiteAtteinte ? (
                          <Text type="warning" style={{ fontSize: 12 }}>
                            {t('{{max}} échéances au plus par paiement en ligne.', { max: selection.max })}
                          </Text>
                        ) : null}
                        {selectedInstallmentIds.length > 0 && availability.feesPaidBy === 'CLIENT' ? (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {t("Des frais de l'agrégateur de paiement peuvent s'ajouter au montant.")}
                          </Text>
                        ) : null}
                      </Space>
                      <Button
                        type="primary"
                        icon={<CreditCardOutlined aria-hidden />}
                        disabled={selectedInstallmentIds.length === 0}
                        loading={payingOnline}
                        onClick={() => void handlePayOnline()}
                      >
                        {t('Payer en ligne')}
                      </Button>
                    </div>
                  </Space>
                ) : null}
                {data ? (
                  <div style={{ overflowX: 'auto' }}>
                    <Table
                      search={echSearch.barre}
                      exportFilename={t('Liste des échéances')}
                      // Export de TOUTES les échéances, avec les mêmes filtres que la liste affichée.
                      exportFetchAll={() =>
                        collectAllPages<InstallmentItem>(async (page, limit) => {
                          const reponse = await tenantPortalService.getInstallments({
                            ...echSearch.filterParams,
                            page,
                            limit
                          });
                          const donnees = reponse.data?.data;
                          return { items: donnees?.installments ?? [], total: donnees?.pagination?.total ?? 0 };
                        })
                      }
                      columns={columns}
                      dataSource={data.installments}
                      rowKey="id"
                      loading={loading}
                      size="middle"
                      scroll={{ x: 1000 }}
                      rowSelection={
                        availability?.available
                          ? {
                              selectedRowKeys: selectedInstallmentIds,
                              onChange: keys => {
                                // Le clic « Tout sélectionner » peut cocher plusieurs baux
                                // d'un coup, avant que getCheckboxProps ne soit recalculé.
                                // Filtrer les clés AVANT de les enregistrer, y compris
                                // celles sélectionnées sur une autre page.
                                const ids = new Set(keys.map(String));
                                const premier = data.installments.find(item => ids.has(item.id) && isPayable(item));
                                const bailCible = selectedLeaseId ?? premier?.leaseId;
                                const compatibles = keys.filter(key => {
                                  const id = String(key);
                                  const ligne = data.installments.find(item => item.id === id);
                                  const bail = ligne?.leaseId ?? leaseByInstallmentId[id];
                                  return bail === bailCible;
                                });
                                selection.surChangement(compatibles, data.installments);
                              },
                              getCheckboxProps: (record: InstallmentItem) => ({
                                // Un paiement en ligne porte sur un seul bail : une fois une
                                // échéance choisie, celles d'un autre bail sont grisées.
                                disabled:
                                  !isPayable(record) ||
                                  (selectedLeaseId !== undefined && record.leaseId !== selectedLeaseId) ||
                                  (selection.limiteAtteinte && !selectedInstallmentIds.includes(record.id)),
                                'aria-label': t('Sélectionner {{period}}', { period: record.period })
                              })
                            }
                          : undefined
                      }
                      pagination={{
                        ...echSearch.tablePagination(data.pagination.total),
                        showTotal: total => t('Total: {{total}} échéances', { total: total })
                      }}
                      locale={echSearch.locale}
                    />
                  </div>
                ) : (
                  <Empty description={t('Aucune échéance trouvée')} />
                )}
              </Card>
            )
          },
          {
            key: 'historique',
            label: t('Historique des paiements'),
            children: (
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                {/* Payment History Table (T073, T074) */}
                <Card
                  title={
                    <>
                      <DollarOutlined /> {t('Historique des paiements')}
                    </>
                  }
                >
                  {paymentHistoryError ? (
                    <Alert
                      message={t('Erreur')}
                      description={paymentHistoryError}
                      type="error"
                      showIcon
                      style={{ marginBottom: 16 }}
                    />
                  ) : null}
                  {paymentHistoryData || paymentHistoryError ? (
                    <div style={{ overflowX: 'auto' }}>
                      <Table
                        search={hisSearch.barre}
                        exportFilename={t('Historique des paiements')}
                        // Export de TOUT l'historique, avec les mêmes filtres que la liste affichée.
                        exportFetchAll={() =>
                          collectAllPages<any>(async (page, limit) => {
                            const reponse = await tenantPortalService.getPaymentHistory({
                              ...hisSearch.filterParams,
                              page,
                              limit
                            });
                            const donnees = reponse.data?.data;
                            return { items: donnees?.payments ?? [], total: donnees?.pagination?.total ?? 0 };
                          })
                        }
                        scroll={{ x: 1000 }}
                        columns={[
                          {
                            title: t('Date'),
                            dataIndex: 'succeededAt',
                            key: 'date',
                            render: (_: string | null, record: any) => {
                              const date = record.succeededAt || record.initiatedAt;
                              return (
                                <Space>
                                  <CalendarOutlined />
                                  {date ? formatDate(date) : '-'}
                                  {record.isDeclaration && (
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                      {t('(déclaration)')}
                                    </Text>
                                  )}
                                </Space>
                              );
                            }
                          },
                          {
                            title: t('Montant'),
                            dataIndex: 'amount',
                            key: 'amount',
                            render: (amount: number) => <Text strong>{formatCurrency(amount)}</Text>
                          },
                          {
                            title: t('Méthode'),
                            dataIndex: 'method',
                            key: 'method',
                            render: (method: string) => getPaymentMethodLabel(method)
                          },
                          {
                            title: t('Référence'),
                            dataIndex: 'reference',
                            key: 'reference',
                            render: (ref: string | null) => ref || '-'
                          },
                          {
                            title: t('Statut'),
                            dataIndex: 'status',
                            key: 'status',
                            render: (status: string, record: any) => {
                              const declStatus = record.declarationStatus || status;
                              const label =
                                declStatus === 'SUCCESS' || declStatus === 'APPROVED'
                                  ? t('Réussi')
                                  : declStatus === 'PENDING'
                                    ? t('En attente')
                                    : declStatus === 'REJECTED'
                                      ? t('Rejetée')
                                      : declStatus === 'FAILED'
                                        ? t('Échoué')
                                        : declStatus === 'CANCELED'
                                          ? t('Annulé')
                                          : status;
                              const color =
                                declStatus === 'SUCCESS' || declStatus === 'APPROVED'
                                  ? 'success'
                                  : declStatus === 'PENDING'
                                    ? 'warning'
                                    : declStatus === 'REJECTED'
                                      ? 'error'
                                      : 'default';
                              return (
                                <Space direction="vertical" size={2}>
                                  <Tag color={color}>{label}</Tag>
                                  {declStatus === 'REJECTED' && record.rejectionReason ? (
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                      {t('Motif : {{reason}}', { reason: record.rejectionReason })}
                                    </Text>
                                  ) : null}
                                </Space>
                              );
                            }
                          },
                          {
                            title: t('Alloué'),
                            dataIndex: 'allocatedAmount',
                            key: 'allocated',
                            render: (amount: number) => formatCurrency(amount),
                            align: 'end' as const
                          },
                          {
                            title: t('Non alloué'),
                            dataIndex: 'unallocatedAmount',
                            key: 'unallocated',
                            render: (amount: number) => (
                              <Text type={amount > 0 ? 'warning' : 'success'}>{formatCurrency(amount)}</Text>
                            ),
                            align: 'end' as const
                          }
                        ]}
                        dataSource={paymentHistoryData?.payments ?? []}
                        rowKey={(r: any) => (r.isDeclaration ? `decl-${r.id}` : r.id)}
                        loading={paymentHistoryLoading}
                        pagination={{
                          ...hisSearch.tablePagination(
                            paymentHistoryData?.pagination?.total ?? paymentHistoryData?.payments?.length ?? 0
                          ),
                          showTotal: total =>
                            t('Total: {{total}} élément{{value}} (paiements et déclarations)', {
                              total: total,
                              value: total !== 1 ? 's' : ''
                            })
                        }}
                        // En erreur, l'alerte ci-dessus parle seule.
                        locale={paymentHistoryError ? { emptyText: <span /> } : hisSearch.locale}
                        expandable={{
                          expandedRowRender: (record: any) => {
                            if (!record.allocations || record.allocations.length === 0) {
                              return <Text type="secondary">{t('Aucune allocation')}</Text>;
                            }
                            return (
                              <Table
                                // Sous-tableau d'une ligne dépliée : il n'a pas son propre export.
                                exportable={false}
                                columns={[
                                  {
                                    title: t('Échéance'),
                                    dataIndex: ['installment', 'period'],
                                    key: 'period',
                                    render: (period: string | null, row: any) =>
                                      row?.installment?.period ?? period ?? '-'
                                  },
                                  {
                                    title: t("Date d'échéance"),
                                    dataIndex: ['installment', 'dueDate'],
                                    key: 'dueDate',
                                    render: (date: string | null, row: any) =>
                                      (row?.installment?.dueDate ?? date)
                                        ? formatDate(row?.installment?.dueDate ?? date)
                                        : '-'
                                  },
                                  {
                                    title: t('Montant alloué'),
                                    dataIndex: 'amount',
                                    key: 'amount',
                                    render: (amount: number) => formatCurrency(amount),
                                    align: 'end' as const
                                  }
                                ]}
                                dataSource={record.allocations}
                                rowKey="id"
                                pagination={false}
                                size="small"
                              />
                            );
                          },
                          rowExpandable: (record: any) => record.allocations && record.allocations.length > 0
                        }}
                      />
                    </div>
                  ) : (
                    <Empty description={t('Aucun paiement trouvé')} />
                  )}
                </Card>

                {/* Total Paid Summary */}
                {paymentHistoryData && (
                  <Card>
                    <Statistic
                      title={t('Total payé (tous les paiements)')}
                      value={paymentHistoryData.totalPaid}
                      prefix={<DollarOutlined />}
                      formatter={value => formatCurrency(Number(value))}
                    />
                  </Card>
                )}
              </Space>
            )
          },
          {
            key: 'releve',
            label: t('Mon relevé'),
            children: <MonReleve />
          }
        ]}
      />

      {/* Installment Details Modal */}
      <Modal
        title={t("Détails de l'échéance")}
        open={detailsModalVisible}
        onCancel={handleCloseDetails}
        footer={null}
        width={800}
        destroyOnClose
      >
        {selectedInstallment && <InstallmentDetails installmentId={selectedInstallment} />}
      </Modal>

      {/* Payment Declaration Modal (T069) */}
      <PaymentDeclarationModal
        open={declarationModalVisible}
        installmentId={declarationFor?.id}
        defaultAmount={declarationFor?.balance}
        installmentLabel={
          declarationFor
            ? hasSeveralLeases && declarationFor.leaseNumber
              ? `${declarationFor.period} (${declarationFor.leaseNumber})`
              : declarationFor.period
            : undefined
        }
        onCancel={() => {
          setDeclarationModalVisible(false);
          setDeclarationFor(null);
        }}
        onSuccess={() => {
          setDeclarationFor(null);
          rechargerListeAffichee();
        }}
      />
    </Space>
  );
}
